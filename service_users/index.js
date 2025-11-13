const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const { v4: uuidv4 } = require('uuid');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const { authMiddleware, requireRole, JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 8001;

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
let usersDb = {};

// Validation schemas
const registerSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().min(2).required(),
    roles: Joi.array().items(Joi.string().valid('user', 'admin', 'manager')).default(['user'])
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
});

const updateProfileSchema = Joi.object({
    name: Joi.string().min(2),
    email: Joi.string().email()
}).min(1);

// Helper functions
const findUserByEmail = (email) => {
    return Object.values(usersDb).find(user => user.email === email);
};

const findUserById = (id) => {
    return usersDb[id];
};

const generateToken = (user) => {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            roles: user.roles 
        },
        JWT_SECRET,
        { expiresIn: '24h' }
    );
};

const sanitizeUser = (user) => {
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
};

// Routes

// Health check
app.get('/users/health', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'OK',
            service: 'Users Service',
            timestamp: new Date().toISOString()
        }
    });
});

// Register new user
app.post('/v1/users/register', async (req, res) => {
    try {
        const { error, value } = registerSchema.validate(req.body);
        
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

        const existingUser = findUserByEmail(value.email);
        if (existingUser) {
            logger.warn({ email: value.email, requestId: req.id }, 'User already exists');
            return res.status(409).json({
                success: false,
                error: {
                    code: 'USER_EXISTS',
                    message: 'User with this email already exists'
                }
            });
        }

        const userId = uuidv4();
        const passwordHash = await bcrypt.hash(value.password, 10);

        const newUser = {
            id: userId,
            email: value.email,
            passwordHash,
            name: value.name,
            roles: value.roles || ['user'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        usersDb[userId] = newUser;

        logger.info({ userId, email: value.email, requestId: req.id }, 'User registered successfully');

        res.status(201).json({
            success: true,
            data: {
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                roles: newUser.roles,
                createdAt: newUser.createdAt
            }
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Registration error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Login user
app.post('/v1/users/login', async (req, res) => {
    try {
        const { error, value } = loginSchema.validate(req.body);
        
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

        const user = findUserByEmail(value.email);
        if (!user) {
            logger.warn({ email: value.email, requestId: req.id }, 'User not found');
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password'
                }
            });
        }

        const isPasswordValid = await bcrypt.compare(value.password, user.passwordHash);
        if (!isPasswordValid) {
            logger.warn({ email: value.email, requestId: req.id }, 'Invalid password');
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_CREDENTIALS',
                    message: 'Invalid email or password'
                }
            });
        }

        const token = generateToken(user);

        logger.info({ userId: user.id, requestId: req.id }, 'User logged in successfully');

        res.json({
            success: true,
            data: {
                token,
                user: sanitizeUser(user)
            }
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Login error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Get current user profile
app.get('/v1/users/profile', authMiddleware, (req, res) => {
    try {
        const user = findUserById(req.user.id);
        
        if (!user) {
            logger.warn({ userId: req.user.id, requestId: req.id }, 'User not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        logger.info({ userId: user.id, requestId: req.id }, 'Profile retrieved');

        res.json({
            success: true,
            data: sanitizeUser(user)
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Get profile error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Update current user profile
app.put('/v1/users/profile', authMiddleware, async (req, res) => {
    try {
        const { error, value } = updateProfileSchema.validate(req.body);
        
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

        const user = findUserById(req.user.id);
        
        if (!user) {
            logger.warn({ userId: req.user.id, requestId: req.id }, 'User not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        // Check if email is being changed and already exists
        if (value.email && value.email !== user.email) {
            const existingUser = findUserByEmail(value.email);
            if (existingUser) {
                logger.warn({ email: value.email, requestId: req.id }, 'Email already in use');
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'EMAIL_EXISTS',
                        message: 'Email already in use'
                    }
                });
            }
        }

        const updatedUser = {
            ...user,
            ...value,
            updatedAt: new Date().toISOString()
        };

        usersDb[user.id] = updatedUser;

        logger.info({ userId: user.id, requestId: req.id }, 'Profile updated');

        res.json({
            success: true,
            data: sanitizeUser(updatedUser)
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Update profile error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Get all users (admin only)
app.get('/v1/users', authMiddleware, requireRole(['admin']), (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const role = req.query.role;

        let users = Object.values(usersDb);

        // Filter by role if provided
        if (role) {
            users = users.filter(user => user.roles.includes(role));
        }

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedUsers = users.slice(startIndex, endIndex);

        logger.info({ 
            page, 
            limit, 
            total: users.length, 
            requestId: req.id 
        }, 'Users list retrieved');

        res.json({
            success: true,
            data: {
                users: paginatedUsers.map(sanitizeUser),
                pagination: {
                    page,
                    limit,
                    total: users.length,
                    totalPages: Math.ceil(users.length / limit)
                }
            }
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Get users error');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error'
            }
        });
    }
});

// Get user by ID (for internal service calls)
app.get('/v1/users/:userId', (req, res) => {
    try {
        const user = findUserById(req.params.userId);
        
        if (!user) {
            logger.warn({ userId: req.params.userId, requestId: req.id }, 'User not found');
            return res.status(404).json({
                success: false,
                error: {
                    code: 'USER_NOT_FOUND',
                    message: 'User not found'
                }
            });
        }

        logger.info({ userId: user.id, requestId: req.id }, 'User retrieved');

        res.json({
            success: true,
            data: sanitizeUser(user)
        });
    } catch (error) {
        logger.error({ error: error.message, requestId: req.id }, 'Get user error');
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
    logger.info({ port: PORT }, 'Users service started');
});

module.exports = app;