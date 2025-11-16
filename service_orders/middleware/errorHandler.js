const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error({
        error: err.message,
        stack: err.stack,
        requestId: req.id
    }, 'Unhandled error');

    res.status(err.statusCode || 500).json({
        success: false,
        error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || 'An unexpected error occurred'
        }
    });
};

module.exports = errorHandler;