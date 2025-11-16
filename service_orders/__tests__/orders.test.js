const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');

// Генерируем валидный JWT токен для тестов
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

const generateToken = (userId = 'test-user-id', roles = ['user']) => {
    return jwt.sign(
        {
            id: userId,
            email: 'test@example.com',
            roles: roles
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
};

describe('Orders Service', () => {
    let authToken;
    let orderId;

    beforeAll(() => {
        // Генерируем токен перед всеми тестами
        authToken = generateToken();
    });

    describe('POST /v1/orders', () => {
        it('should create order successfully', async () => {
            const orderData = {
                items: [
                    {
                        productId: 'prod-123',
                        productName: 'Test Product',
                        quantity: 2,
                        price: 100
                    }
                ]
            };

            const response = await request(app)
                .post('/v1/orders')
                .set('Authorization', `Bearer ${authToken}`)
                .send(orderData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.items).toHaveLength(1);
            expect(response.body.data.totalAmount).toBe(200);
            expect(response.body.data.status).toBe('created');

            // Сохраняем ID для последующих тестов
            orderId = response.body.data.id;
        });

        it('should fail without authentication', async () => {
            const response = await request(app)
                .post('/v1/orders')
                .send({
                    items: [
                        {
                            productId: 'prod-123',
                            productName: 'Test Product',
                            quantity: 1,
                            price: 50
                        }
                    ]
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        it('should fail with empty items', async () => {
            const response = await request(app)
                .post('/v1/orders')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    items: []
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should fail with invalid item data', async () => {
            const response = await request(app)
                .post('/v1/orders')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    items: [
                        {
                            productId: 'prod-123',
                            // отсутствует productName
                            quantity: -1, // неверное количество
                            price: 'invalid' // неверная цена
                        }
                    ]
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /v1/orders/:orderId', () => {
        it('should get order by ID', async () => {
            const response = await request(app)
                .get(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(orderId);
        });

        it('should fail with invalid order ID', async () => {
            const response = await request(app)
                .get('/v1/orders/invalid-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
        });
    });

    describe('GET /v1/orders', () => {
        it('should get user orders with pagination', async () => {
            const response = await request(app)
                .get('/v1/orders?page=1&limit=10')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('orders');
            expect(response.body.data).toHaveProperty('pagination');
        });

        it('should filter by status', async () => {
            const response = await request(app)
                .get('/v1/orders?status=created')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('PUT /v1/orders/:orderId', () => {
        it('should update order status', async () => {
            const response = await request(app)
                .put(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    status: 'in_progress'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('in_progress');
        });

        it('should fail with invalid status', async () => {
            const response = await request(app)
                .put(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    status: 'invalid_status'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('DELETE /v1/orders/:orderId', () => {
        it('should cancel order successfully', async () => {
            const response = await request(app)
                .delete(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.order.status).toBe('cancelled');
        });
    });

    describe('GET /orders/health', () => {
        it('should return health status', async () => {
            const response = await request(app)
                .get('/orders/health')
                .expect(200);

            expect(response.body.status).toBe('healthy');
            expect(response.body.service).toBe('orders');
        });
    });
});

// Закрываем сервер после тестов
afterAll((done) => {
    if (app.server) {
        app.server.close(done);
    } else {
        done();
    }
});