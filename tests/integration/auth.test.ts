import request from 'supertest';
import express from 'express';
import authRoutes from '../../src/routes/auth.routes';
import { errorHandler } from '../../src/middleware/error.middleware';

// Create test app
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use(errorHandler);
describe('Auth API Integration Tests', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const newUser = {
        name: 'Test User',
        email: `test${Date.now()}@example.com`,
        password: 'Test123!@#',
        phone: '+91-9876543210',
        city: 'Mumbai',
        role: 'TENANT'
      };
      const response = await request(app).post('/api/auth/register').send(newUser).expect(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('token');
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe(newUser.email);
      expect(response.body.data.user).not.toHaveProperty('password');
    });
    it('should reject registration with invalid email', async () => {
      const invalidUser = {
        name: 'Test User',
        email: 'invalid-email',
        password: 'Test123!@#',
        phone: '+91-9876543210',
        city: 'Mumbai',
        role: 'TENANT'
      };
      const response = await request(app).post('/api/auth/register').send(invalidUser).expect(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('validation');
    });
    it('should reject registration with weak password', async () => {
      const weakPasswordUser = {
        name: 'Test User',
        email: 'test@example.com',
        password: '123',
        phone: '+91-9876543210',
        city: 'Mumbai',
        role: 'TENANT'
      };
      const response = await request(app).post('/api/auth/register').send(weakPasswordUser).expect(400);
      expect(response.body.success).toBe(false);
    });
  });
  describe('POST /api/auth/login', () => {
    it('should reject login with invalid credentials', async () => {
      const credentials = {
        email: 'nonexistent@example.com',
        password: 'WrongPassword123'
      };
      const response = await request(app).post('/api/auth/login').send(credentials).expect(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });
    it('should reject login with missing fields', async () => {
      const response = await request(app).post('/api/auth/login').send({
        email: 'test@example.com'
      }).expect(400);
      expect(response.body.success).toBe(false);
    });
  });
});