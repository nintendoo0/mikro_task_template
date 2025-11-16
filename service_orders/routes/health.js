const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'orders',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;