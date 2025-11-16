const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const authenticateToken = require('../middleware/auth');
const logger = require('../utils/logger');

// Временное хранилище заказов (в памяти)
const orders = new Map();

// Схемы валидации
const itemSchema = Joi.object({
    productId: Joi.string().required(),
    productName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required(),
    price: Joi.number().min(0).required()
});

const createOrderSchema = Joi.object({
    items: Joi.array().items(itemSchema).min(1).required()
});

const updateOrderSchema = Joi.object({
    status: Joi.string().valid('created', 'in_progress', 'completed', 'cancelled').required()
});

// POST /v1/orders - Создание заказа
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const { error, value } = createOrderSchema.validate(req.body);
        
        if (error) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.details[0].message
                }
            });
        }

        const orderId = uuidv4();
        const totalAmount = value.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);

        const order = {
            id: orderId,
            userId: req.user.id,
            items: value.items,
            totalAmount,
            status: 'created',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        orders.set(orderId, order);

        logger.info({
            orderId,
            userId: req.user.id,
            totalAmount,
            requestId: req.id
        }, 'Order created successfully');

        res.status(201).json({
            success: true,
            data: order
        });
    } catch (err) {
        next(err);
    }
});

// GET /v1/orders - Получение списка заказов пользователя
router.get('/', authenticateToken, async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const userId = req.user.id;

        // Фильтрация заказов пользователя
        let userOrders = Array.from(orders.values()).filter(order => order.userId === userId);

        // Фильтр по статусу
        if (status) {
            userOrders = userOrders.filter(order => order.status === status);
        }

        // Пагинация
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + parseInt(limit);
        const paginatedOrders = userOrders.slice(startIndex, endIndex);

        logger.info({
            userId,
            page: parseInt(page),
            limit: parseInt(limit),
            total: userOrders.length,
            requestId: req.id
        }, 'Orders list retrieved');

        res.json({
            success: true,
            data: {
                orders: paginatedOrders,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: userOrders.length,
                    totalPages: Math.ceil(userOrders.length / limit)
                }
            }
        });
    } catch (err) {
        next(err);
    }
});

// GET /v1/orders/:orderId - Получение конкретного заказа
router.get('/:orderId', authenticateToken, async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);

        if (!order) {
            logger.warn({
                orderId,
                userId: req.user.id,
                requestId: req.id
            }, 'Order not found');

            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Проверка, что заказ принадлежит пользователю
        if (order.userId !== req.user.id && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        logger.info({
            orderId,
            userId: req.user.id,
            requestId: req.id
        }, 'Order retrieved');

        res.json({
            success: true,
            data: order
        });
    } catch (err) {
        next(err);
    }
});

// PUT /v1/orders/:orderId - Обновление статуса заказа
router.put('/:orderId', authenticateToken, async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const { error, value } = updateOrderSchema.validate(req.body);

        if (error) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: error.details[0].message
                }
            });
        }

        const order = orders.get(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Проверка прав
        if (order.userId !== req.user.id && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        order.status = value.status;
        order.updatedAt = new Date().toISOString();

        logger.info({
            orderId,
            userId: req.user.id,
            newStatus: value.status,
            requestId: req.id
        }, 'Order status updated');

        res.json({
            success: true,
            data: order
        });
    } catch (err) {
        next(err);
    }
});

// DELETE /v1/orders/:orderId - Отмена заказа
router.delete('/:orderId', authenticateToken, async (req, res, next) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'ORDER_NOT_FOUND',
                    message: 'Order not found'
                }
            });
        }

        // Проверка прав
        if (order.userId !== req.user.id && !req.user.roles.includes('admin')) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: 'Access denied'
                }
            });
        }

        order.status = 'cancelled';
        order.updatedAt = new Date().toISOString();

        logger.info({
            orderId,
            userId: req.user.id,
            requestId: req.id
        }, 'Order cancelled');

        res.json({
            success: true,
            data: {
                message: 'Order cancelled successfully',
                order
            }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;