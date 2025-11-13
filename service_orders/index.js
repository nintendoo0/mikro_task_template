const express = require('express');
const cors = require('cors');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const { authMiddleware, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8002;
const USERS_SERVICE_URL = process.env.USERS_SERVICE_URL || 'http://service_users:8001';

// Middleware
app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger }));

// Request ID middleware
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuidv4();
    res.setHeader('X-Request-ID', req.id);
    next();
});

// Имитация базы данных в памяти
let ordersDb = {};

// Validation schemas
const createOrderSchema = Joi.object({
    items: Joi.array().items(
        Joi.object({
            productId: Joi.string().required(),
            productName: Joi.string().required(),
            quantity: Joi.number().integer().min(1).required(),
            price: Joi.number().min(0).required()
        })
    ).min(1).required()
});

const updateOrderSchema = Joi.object({
    status: Joi.string().valid('created', 'in_progress', 'completed', 'cancelled').required()
});

// Helper functions
const calculateTotal = (items) => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
};

const findOrderById = (orderId) => {
    return ordersDb[orderId];
};

const getUserOrders = (userId) => {
    return Object.values(ordersDb).filter(order => order.userId === userId);
};

const checkUserExists = async (userId, requestId) => {
    try {
        const response = await axios.get(`${USERS_SERVICE_URL}/v1/users/${userId}`, {
            headers: {
                'X-Request-ID': requestId
            }
        });
        return response.data.success;
    } catch (error) {
        logger.error({ error: error.message, userId, requestId }, 'Error checking user existence');
        return false;
    }
};

const publishEvent = (eventType, data) => {
    // Заготовка для публикации событий в брокер сообщений
    logger.info({ eventType, data }, 'Event published');
    // TODO: Integrate with message broker (RabbitMQ, Kafka, etc.)
};

// Routes

// Health check
app.get('/orders/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'OK',
            service: 'Orders Service',
            timestamp: new Date().toISOString()
        }
    });
});

// Create new order
app.post('/v1/orders', authMiddleware, async (req, res) => {
    try {
        const { error, value } = createOrderSchema.validate(req.body);
        
        if (error) {
            logger.warn({ error: error.details, requestId: req.id }, 'Validation error');
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.details[0].message
                }
            });
        }

        // Check if user exists
        const userExists = await checkUserExists(req.user.id, req.id);
        if (!userExists) {
            logger.warn({ userId: req.user.id, requestId: req.id }, 'User not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        const orderId = uuidv4();
        const totalAmount = calculateTotal(value.items);

        const newOrder = {
            id: orderId,
            userId: req.user.id,
            items: value.items,
            status: 'created',
            totalAmount,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        ordersDb[orderId] = newOrder;

        // Publish event
        publishEvent('ORDER_CREATED', {
            orderId: newOrder.id,
            userId: newOrder.userId,
            totalAmount: newOrder.totalAmount,
            timestamp: newOrder.createdAt
        });

        logger.info({ 
            orderId, 
            userId: req.user.id, 
            totalAmount, 
            requestId: req.id 
        }, 'Order created successfully');

        res.status(201).json({
            success: true,
            data: newOrder
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Create order error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Get order by ID
app.get('/v1/orders/:orderId', authMiddleware, (req, res) => {
    try {
        const order = findOrderById(req.params.orderId);
        
        if (!order) {
            logger.warn({ orderId: req.params.orderId, requestId: req.id }, 'Order not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Check if user owns the order or is admin
        const isOwner = order.userId === req.user.id;
        const isAdmin = req.user.roles && req.user.roles.includes('admin');

        if (!isOwner && !isAdmin) {
            logger.warn({ 
                orderId: req.params.orderId, 
                userId: req.user.id, 
                requestId: req.id 
            }, 'Access denied');
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied to this order'
                }
            });
        }

        logger.info({ orderId: order.id, requestId: req.id }, 'Order retrieved');

        res.json({
            success: true,
            data: order
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Get order error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Get user orders
app.get('/v1/orders', authMiddleware, (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        const sortBy = req.query.sortBy || 'createdAt';
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        let orders = getUserOrders(req.user.id);

        // Filter by status if provided
        if (status) {
            orders = orders.filter(order => order.status === status);
        }

        // Sort orders
        orders.sort((a, b) => {
            if (a[sortBy] < b[sortBy]) return -1 * sortOrder;
            if (a[sortBy] > b[sortBy]) return 1 * sortOrder;
            return 0;
        });

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedOrders = orders.slice(startIndex, endIndex);

        logger.info({ 
            userId: req.user.id, 
            page, 
            limit, 
            total: orders.length, 
            requestId: req.id 
        }, 'Orders list retrieved');

        res.json({
            success: true,
            data: {
                orders: paginatedOrders,
                pagination: {
                    page,
                    limit,
                    total: orders.length,
                    totalPages: Math.ceil(orders.length / limit)
                }
            }
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Get orders error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Update order status
app.put('/v1/orders/:orderId', authMiddleware, (req, res) => {
    try {
        const { error, value } = updateOrderSchema.validate(req.body);
        
        if (error) {
            logger.warn({ error: error.details, requestId: req.id }, 'Validation error');
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.details[0].message
                }
            });
        }

        const order = findOrderById(req.params.orderId);
        
        if (!order) {
            logger.warn({ orderId: req.params.orderId, requestId: req.id }, 'Order not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Check permissions
        const isOwner = order.userId === req.user.id;
        const isAdmin = req.user.roles && req.user.roles.includes('admin');
        const isManager = req.user.roles && req.user.roles.includes('manager');

        if (!isOwner && !isAdmin && !isManager) {
            logger.warn({ 
                orderId: req.params.orderId, 
                userId: req.user.id, 
                requestId: req.id 
            }, 'Access denied');
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied to update this order'
                }
            });
        }

        // Users can only cancel their own orders
        if (isOwner && !isAdmin && !isManager && value.status !== 'cancelled') {
            logger.warn({ 
                orderId: req.params.orderId, 
                userId: req.user.id, 
                requestId: req.id 
            }, 'Users can only cancel orders');
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'You can only cancel your orders'
                }
            });
        }

        const previousStatus = order.status;
        const updatedOrder = {
            ...order,
            status: value.status,
            updatedAt: new Date().toISOString()
        };

        ordersDb[order.id] = updatedOrder;

        // Publish event
        publishEvent('ORDER_STATUS_UPDATED', {
            orderId: updatedOrder.id,
            userId: updatedOrder.userId,
            previousStatus,
            newStatus: updatedOrder.status,
            timestamp: updatedOrder.updatedAt
        });

        logger.info({ 
            orderId: order.id, 
            previousStatus, 
            newStatus: value.status, 
            requestId: req.id 
        }, 'Order status updated');

        res.json({
            success: true,
            data: updatedOrder
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Update order error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Cancel order
app.delete('/v1/orders/:orderId', authMiddleware, (req, res) => {
    try {
        const order = findOrderById(req.params.orderId);
        
        if (!order) {
            logger.warn({ orderId: req.params.orderId, requestId: req.id }, 'Order not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Check if user owns the order or is admin
        const isOwner = order.userId === req.user.id;
        const isAdmin = req.user.roles && req.user.roles.includes('admin');

        if (!isOwner && !isAdmin) {
            logger.warn({ 
                orderId: req.params.orderId, 
                userId: req.user.id, 
                requestId: req.id 
            }, 'Access denied');
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied to cancel this order'
                }
            });
        }

        // Check if order can be cancelled
        if (order.status === 'completed') {
            logger.warn({ 
                orderId: req.params.orderId, 
                requestId: req.id 
            }, 'Cannot cancel completed order');
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_OPERATION',
                    message: 'Cannot cancel completed order'
                }
            });
        }

        if (order.status === 'cancelled') {
            logger.warn({ 
                orderId: req.params.orderId, 
                requestId: req.id 
            }, 'Order already cancelled');
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_OPERATION',
                    message: 'Order already cancelled'
                }
            });
        }

        const updatedOrder = {
            ...order,
            status: 'cancelled',
            updatedAt: new Date().toISOString()
        };

        ordersDb[order.id] = updatedOrder;

        // Publish event
        publishEvent('ORDER_CANCELLED', {
            orderId: updatedOrder.id,
            userId: updatedOrder.userId,
            timestamp: updatedOrder.updatedAt
        });

        logger.info({ 
            orderId: order.id, 
            requestId: req.id 
        }, 'Order cancelled');

        res.json({
            success: true,
            data: {
                message: 'Order cancelled successfully',
                order: updatedOrder
            }
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Cancel order error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    logger.info({ port: PORT }, 'Orders service started');
});

module.exports = app;