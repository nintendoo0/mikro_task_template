const request = require('supertest');
const app = require('../index');
const axios = require('axios');

// Mock axios для имитации вызовов к Users Service
jest.mock('axios');

describe('Orders Service', () => {
    let authToken;
    let userId;
    let orderId;

    beforeAll(() => {
        // Мок данные пользователя
        userId = 'test-user-id-123';
        authToken = 'test-auth-token';

        // Мок ответа от Users Service
        axios.get.mockResolvedValue({
            data: {
                success: true,
                data: {
                    id: userId,
                    email: 'test@example.com',
                    name: 'Test User',
                    roles: ['user']
                }
            }
        });
    });

    afterAll(() => {
        jest.restoreAllMocks();
    });

    describe('POST /v1/orders', () => {
        test('should create order successfully', async () => {
            const orderData = {
                items: [
                    {
                        productId: 'prod-001',
                        productName: 'Кирпич красный',
                        quantity: 1000,
                        price: 15.50
                    },
                    {
                        productId: 'prod-002',
                        productName: 'Цемент М500',
                        quantity: 50,
                        price: 350.00
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
            expect(response.body.data.status).toBe('created');
            expect(response.body.data.userId).toBe(userId);
            expect(response.body.data.totalAmount).toBe(33000);
            expect(response.body.data.items).toHaveLength(2);

            orderId = response.body.data.id;
        });

        test('should fail without authentication', async () => {
            const response = await request(app)
                .post('/v1/orders')
                .send({
                    items: [
                        {
                            productId: 'prod-001',
                            productName: 'Test Product',
                            quantity: 1,
                            price: 100
                        }
                    ]
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });

        test('should fail with empty items', async () => {
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

        test('should fail with invalid item data', async () => {
            const response = await request(app)
                .post('/v1/orders')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    items: [
                        {
                            productId: 'prod-001',
                            productName: 'Test Product',
                            quantity: -1,
                            price: 100
                        }
                    ]
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /v1/orders/:orderId', () => {
        test('should get order by ID', async () => {
            const response = await request(app)
                .get(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.id).toBe(orderId);
            expect(response.body.data.userId).toBe(userId);
        });

        test('should fail with invalid order ID', async () => {
            const response = await request(app)
                .get('/v1/orders/invalid-id')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
        });
    });

    describe('GET /v1/orders', () => {
        test('should get user orders with pagination', async () => {
            const response = await request(app)
                .get('/v1/orders?page=1&limit=10')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('orders');
            expect(response.body.data).toHaveProperty('pagination');
        });

        test('should filter by status', async () => {
            const response = await request(app)
                .get('/v1/orders?status=created')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
        });
    });

    describe('PUT /v1/orders/:orderId', () => {
        test('should update order status', async () => {
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

        test('should fail with invalid status', async () => {
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
        test('should cancel order successfully', async () => {
            const response = await request(app)
                .delete(`/v1/orders/${orderId}`)
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.order.status).toBe('cancelled');
        });
    });

    describe('GET /orders/health', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/orders/health')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('OK');
        });
    });
});