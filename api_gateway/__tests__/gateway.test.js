const request = require('supertest');
const app = require('../index');

describe('API Gateway', () => {
    describe('Health & Status Endpoints', () => {
        test('GET /health should return gateway health', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('OK');
            expect(response.body.data.service).toBe('API Gateway');
            expect(response.body.data).toHaveProperty('circuits');
        });

        test('GET /status should return detailed status', async () => {
            const response = await request(app)
                .get('/status')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('gateway');
            expect(response.body.data).toHaveProperty('services');
        });
    });

    describe('Authentication & Authorization', () => {
        test('should reject requests without token', async () => {
            const response = await request(app)
                .get('/v1/users/profile')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        test('should reject requests with invalid token', async () => {
            const response = await request(app)
                .get('/v1/users/profile')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_TOKEN');
        });
    });

    describe('Error Handling', () => {
        test('should return 404 for non-existent endpoints', async () => {
            const response = await request(app)
                .get('/non-existent-endpoint')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });
    });

    describe('Request ID Tracking', () => {
        test('should include X-Request-ID in response headers', async () => {
            const response = await request(app)
                .get('/health');

            expect(response.headers).toHaveProperty('x-request-id');
        });

        test('should use provided X-Request-ID', async () => {
            const requestId = 'test-request-123';
            const response = await request(app)
                .get('/health')
                .set('X-Request-ID', requestId);

            expect(response.headers['x-request-id']).toBe(requestId);
        });
    });
});