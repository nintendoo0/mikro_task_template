const express = require('express');
const logger = require('./utils/logger');
const ordersRoutes = require('./routes/orders');
const healthRoutes = require('./routes/health');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 8002;

// Middleware
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Request ID middleware
app.use((req, res, next) => {
    req.id = require('crypto').randomUUID();
    res.setHeader('X-Request-ID', req.id);
    next();
});

// Logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        logger.info({
            req: {
                id: req.id,
                method: req.method,
                url: req.url,
                query: req.query,
                params: req.params,
                headers: req.headers,
                remoteAddress: req.ip,
                remotePort: req.socket.remotePort
            },
            res: {
                statusCode: res.statusCode,
                headers: res.getHeaders()
            },
            responseTime: Date.now() - startTime
        }, 'request completed');
    });
    next();
});

// Routes
app.use('/v1/orders', ordersRoutes);
app.use('/orders', healthRoutes);

// Error handler
app.use(errorHandler);

// Экспортируем app для тестов
let server;
if (process.env.NODE_ENV !== 'test') {
    server = app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Orders service started');
    });
}

// Для тестов
app.server = server;

module.exports = app;