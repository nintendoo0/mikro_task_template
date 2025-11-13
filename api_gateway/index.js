const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const CircuitBreaker = require('opossum');
const pinoHttp = require('pino-http');
const { v4: uuidv4 } = require('uuid');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Service URLs
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://service_users:8001';
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://service_orders:8002';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Request ID middleware
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later.'
        }
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/v1/', limiter);

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        success: false,
        error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts, please try again later.'
        }
    }
});

// JWT verification middleware
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'No token provided'
            }
        });
    }

    try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Token verification failed');
        return res.status(401).json({
            success: false,
            error: {
                code: 'INVALID_TOKEN',
                message: 'Invalid or expired token'
            }
        });
    }
};

// Circuit Breaker configuration
const circuitOptions = {
    timeout: 5000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    rollingCountTimeout: 10000,
    rollingCountBuckets: 10
};

// Create circuit breakers for each service
const usersCircuit = new CircuitBreaker(async (url, options = {}) => {
    const response = await axios({
        url: `${USERS_SERVICE_URL}${url}`,
        ...options,
        timeout: 5000
    });
    return response.data;
}, circuitOptions);

const ordersCircuit = new CircuitBreaker(async (url, options = {}) => {
    const response = await axios({
        url: `${ORDERS_SERVICE_URL}${url}`,
        ...options,
        timeout: 5000
    });
    return response.data;
}, circuitOptions);

// Fallback functions
usersCircuit.fallback(() => {
    logger.warn('Users service circuit breaker opened');
    return {
        success: false,
        error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Users service temporarily unavailable'
        }
    };
});

ordersCircuit.fallback(() => {
    logger.warn('Orders service circuit breaker opened');
    return {
        success: false,
        error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Orders service temporarily unavailable'
        }
    };
});

// Circuit breaker event logging
usersCircuit.on('open', () => logger.warn('Users circuit breaker opened'));
usersCircuit.on('halfOpen', () => logger.info('Users circuit breaker half-open'));
usersCircuit.on('close', () => logger.info('Users circuit breaker closed'));

ordersCircuit.on('open', () => logger.warn('Orders circuit breaker opened'));
ordersCircuit.on('halfOpen', () => logger.info('Orders circuit breaker half-open'));
ordersCircuit.on('close', () => logger.info('Orders circuit breaker closed'));

// Helper function to forward request
const forwardRequest = async (circuit, url, req, res) => {
    try {
        const headers = {
            'X-Request-ID': req.id,
            'Content-Type': 'application/json'
        };

        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        const options = {
            method: req.method,
            headers,
            ...(req.method !== 'GET' && req.method !== 'HEAD' && { data: req.body }),
            params: req.query
        };

        logger.info({ 
            url, 
            method: req.method, 
            requestId: req.id 
        }, 'Forwarding request');

        const result = await circuit.fire(url, options);
        
        const statusCode = result.success ? 200 : 
                          result.error?.code === 'VALIDATION_ERROR' ? 400 :
                          result.error?.code === 'UNAUTHORIZED' ? 401 :
                          result.error?.code === 'FORBIDDEN' ? 403 :
                          result.error?.code === 'USER_NOT_FOUND' || result.error?.code === 'ORDER_NOT_FOUND' ? 404 :
                          result.error?.code === 'USER_EXISTS' || result.error?.code === 'EMAIL_EXISTS' ? 409 :
                          500;

        return res.status(statusCode).json(result);
    } catch (error) {
        logger.error({ 
            error: error.message, 
            url, 
            requestId: req.id 
        }, 'Request forwarding error');
        
        return res.status(503).json({
            success: false,
            error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Service temporarily unavailable'
            }
        });
    }
};

// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'OK',
            service: 'API Gateway',
            timestamp: new Date().toISOString(),
            circuits: {
                users: {
                    state: usersCircuit.status.state,
                    stats: usersCircuit.status.stats
                },
                orders: {
                    state: ordersCircuit.status.state,
                    stats: ordersCircuit.status.stats
                }
            }
        }
    });
});

// Detailed status endpoint
app.get('/status', (req, res) => {
    res.json({
        success: true,
        data: {
            gateway: {
                status: 'OK',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                timestamp: new Date().toISOString()
            },
            services: {
                users: {
                    circuitState: usersCircuit.status.state,
                    stats: usersCircuit.status.stats
                },
                orders: {
                    circuitState: ordersCircuit.status.state,
                    stats: ordersCircuit.status.stats
                }
            }
        }
    });
});

// ==================== USER ROUTES ====================

// Public routes (no auth required)
app.post('/v1/users/register', authLimiter, (req, res) => {
    return forwardRequest(usersCircuit, '/v1/users/register', req, res);
});

app.post('/v1/users/login', authLimiter, (req, res) => {
    return forwardRequest(usersCircuit, '/v1/users/login', req, res);
});

// Protected user routes
app.get('/v1/users/profile', verifyToken, (req, res) => {
    return forwardRequest(usersCircuit, '/v1/users/profile', req, res);
});

app.put('/v1/users/profile', verifyToken, (req, res) => {
    return forwardRequest(usersCircuit, '/v1/users/profile', req, res);
});

app.get('/v1/users', verifyToken, (req, res) => {
    return forwardRequest(usersCircuit, '/v1/users', req, res);
});

app.get('/v1/users/:userId', verifyToken, (req, res) => {
    return forwardRequest(usersCircuit, `/v1/users/${req.params.userId}`, req, res);
});

// ==================== ORDER ROUTES ====================

// All order routes require authentication
app.post('/v1/orders', verifyToken, (req, res) => {
    return forwardRequest(ordersCircuit, '/v1/orders', req, res);
});

app.get('/v1/orders', verifyToken, (req, res) => {
    return forwardRequest(ordersCircuit, '/v1/orders', req, res);
});

app.get('/v1/orders/:orderId', verifyToken, (req, res) => {
    return forwardRequest(ordersCircuit, `/v1/orders/${req.params.orderId}`, req, res);
});

app.put('/v1/orders/:orderId', verifyToken, (req, res) => {
    return forwardRequest(ordersCircuit, `/v1/orders/${req.params.orderId}`, req, res);
});

app.delete('/v1/orders/:orderId', verifyToken, (req, res) => {
    return forwardRequest(ordersCircuit, `/v1/orders/${req.params.orderId}`, req, res);
});

// ==================== AGGREGATION ENDPOINTS ====================

// Get user profile with their orders
app.get('/v1/users/:userId/details', verifyToken, async (req, res) => {
    try {
        const userId = req.params.userId;

        // Check if user is requesting their own data or is admin
        if (req.user.id !== userId && !req.user.roles?.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        logger.info({ userId, requestId: req.id }, 'Fetching user details with orders');

        const headers = {
            'X-Request-ID': req.id,
            'Authorization': req.headers.authorization
        };

        // Fetch user and orders in parallel
        const [userResult, ordersResult] = await Promise.allSettled([
            usersCircuit.fire(`/v1/users/${userId}`, { 
                method: 'GET', 
                headers 
            }),
            ordersCircuit.fire('/v1/orders', { 
                method: 'GET', 
                headers,
                params: { userId }
            })
        ]);

        if (userResult.status === 'rejected' || !userResult.value?.success) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        const userData = userResult.value.data;
        const ordersData = ordersResult.status === 'fulfilled' && ordersResult.value?.success
            ? ordersResult.value.data
            : { orders: [], pagination: { total: 0 } };

        logger.info({ 
            userId, 
            ordersCount: ordersData.orders?.length || 0, 
            requestId: req.id 
        }, 'User details retrieved');

        res.json({
            success: true,
            data: {
                user: userData,
                orders: ordersData.orders || [],
                ordersSummary: {
                    total: ordersData.pagination?.total || 0,
                    byStatus: (ordersData.orders || []).reduce((acc, order) => {
                        acc[order.status] = (acc[order.status] || 0) + 1;
                        return acc;
                    }, {})
                }
            }
        });
    } catch (error) {
        logger.error({ 
            error: error.message, 
            userId: req.params.userId, 
            requestId: req.id 
        }, 'Error fetching user details');
        
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'Endpoint not found'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    logger.error({ error: err.message, stack: err.stack, requestId: req.id }, 'Unhandled error');
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
        }
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'API Gateway started');
});

module.exports = app;