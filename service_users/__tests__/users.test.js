const request = require('supertest');
const app = require('../index');

describe('Users Service - Authentication', () => {
    let authToken;
    let userId;
    const testUser = {
        email: `test${Date.now()}@example.com`,
        password: 'password123',
        name: 'Test User'
    };

    describe('POST /v1/users/register', () => {
        test('should register a new user successfully', async () => {
            const response = await request(app)
                .post('/v1/users/register')
                .send(testUser)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.email).toBe(testUser.email);
            expect(response.body.data.name).toBe(testUser.name);
            expect(response.body.data.roles).toEqual(['user']);
            
            userId = response.body.data.id;
        });

        test('should fail with duplicate email', async () => {
            const response = await request(app)
                .post('/v1/users/register')
                .send(testUser)
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('USER_EXISTS');
        });

        test('should fail with invalid email', async () => {
            const response = await request(app)
                .post('/v1/users/register')
                .send({
                    email: 'invalid-email',
                    password: 'password123',
                    name: 'Test User'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should fail with short password', async () => {
            const response = await request(app)
                .post('/v1/users/register')
                .send({
                    email: 'test2@example.com',
                    password: '123',
                    name: 'Test User'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should fail with missing required fields', async () => {
            const response = await request(app)
                .post('/v1/users/register')
                .send({
                    email: 'test3@example.com'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('POST /v1/users/login', () => {
        test('should login successfully with correct credentials', async () => {
            const response = await request(app)
                .post('/v1/users/login')
                .send({
                    email: testUser.email,
                    password: testUser.password
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('token');
            expect(response.body.data).toHaveProperty('user');
            expect(response.body.data.user.email).toBe(testUser.email);
            
            authToken = response.body.data.token;
        });

        test('should fail with wrong password', async () => {
            const response = await request(app)
                .post('/v1/users/login')
                .send({
                    email: testUser.email,
                    password: 'wrongpassword'
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        test('should fail with non-existent email', async () => {
            const response = await request(app)
                .post('/v1/users/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'password123'
                })
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
        });

        test('should fail with invalid email format', async () => {
            const response = await request(app)
                .post('/v1/users/login')
                .send({
                    email: 'invalid-email',
                    password: 'password123'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /v1/users/profile', () => {
        test('should get user profile with valid token', async () => {
            const response = await request(app)
                .get('/v1/users/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.email).toBe(testUser.email);
            expect(response.body.data.name).toBe(testUser.name);
            expect(response.body.data).not.toHaveProperty('passwordHash');
        });

        test('should fail without token', async () => {
            const response = await request(app)
                .get('/v1/users/profile')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('UNAUTHORIZED');
        });

        test('should fail with invalid token', async () => {
            const response = await request(app)
                .get('/v1/users/profile')
                .set('Authorization', 'Bearer invalid-token')
                .expect(401);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('INVALID_TOKEN');
        });
    });

    describe('PUT /v1/users/profile', () => {
        test('should update user profile successfully', async () => {
            const response = await request(app)
                .put('/v1/users/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'Updated Name'
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.name).toBe('Updated Name');
        });

        test('should update email successfully', async () => {
            const newEmail = `updated${Date.now()}@example.com`;
            const response = await request(app)
                .put('/v1/users/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    email: newEmail
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.email).toBe(newEmail);
        });

        test('should fail with invalid data', async () => {
            const response = await request(app)
                .put('/v1/users/profile')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    name: 'A' // Too short
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        test('should fail without token', async () => {
            const response = await request(app)
                .put('/v1/users/profile')
                .send({
                    name: 'New Name'
                })
                .expect(401);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /v1/users (Admin only)', () => {
        let adminToken;

        beforeAll(async () => {
            const adminUser = {
                email: `admin${Date.now()}@example.com`,
                password: 'admin123',
                name: 'Admin User',
                roles: ['admin']
            };

            await request(app)
                .post('/v1/users/register')
                .send(adminUser);

            const loginResponse = await request(app)
                .post('/v1/users/login')
                .send({
                    email: adminUser.email,
                    password: adminUser.password
                });

            adminToken = loginResponse.body.data.token;
        });

        test('should get users list as admin', async () => {
            const response = await request(app)
                .get('/v1/users')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('users');
            expect(response.body.data).toHaveProperty('pagination');
            expect(Array.isArray(response.body.data.users)).toBe(true);
        });

        test('should support pagination', async () => {
            const response = await request(app)
                .get('/v1/users?page=1&limit=5')
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.data.pagination.page).toBe(1);
            expect(response.body.data.pagination.limit).toBe(5);
        });

        test('should fail for non-admin user', async () => {
            const response = await request(app)
                .get('/v1/users')
                .set('Authorization', `Bearer ${authToken}`)
                .expect(403);

            expect(response.body.success).toBe(false);
            expect(response.body.error.code).toBe('FORBIDDEN');
        });
    });

    describe('GET /users/health', () => {
        test('should return health status', async () => {
            const response = await request(app)
                .get('/users/health')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe('OK');
            expect(response.body.data.service).toBe('Users Service');
        });
    });
});