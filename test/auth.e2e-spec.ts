import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@app/core';
import { Server } from 'http';

describe('Authentication Flows (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testUser = {
    email: 'auth_e2e_test@test.com',
    password: 'password123',
    displayName: 'Auth Test User',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Clean up any existing test user before starting
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = $1`,
      testUser.email,
    );
  });

  afterAll(async () => {
    // Teardown
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = $1`,
      testUser.email,
    );
    await app.close();
  });

  describe('Registration & Login', () => {
    it('should successfully register a new user', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/identity/register')
        .send(testUser)
        .expect(201);

      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should fail to register with a duplicate email', async () => {
      await request(app.getHttpServer() as Server)
        .post('/identity/register')
        .send(testUser)
        .expect(409); // Conflict
    });

    it('should successfully login with valid credentials', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/identity/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(testUser.email);
    });

    it('should fail to login with invalid credentials', async () => {
      await request(app.getHttpServer() as Server)
        .post('/identity/login')
        .send({
          email: testUser.email,
          password: 'wrongpassword',
        })
        .expect(403);
    });
  });

  describe('JWT Protection (/identity/profile)', () => {
    it('should reject unauthenticated requests to protected routes', async () => {
      await request(app.getHttpServer() as Server)
        .get('/identity/profile')
        .expect(401);
    });

    it('should return profile for authenticated requests', async () => {
      // 1. Get token
      const loginRes = await request(app.getHttpServer() as Server)
        .post('/identity/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      const token = loginRes.body.accessToken;

      // 2. Fetch profile
      const profileRes = await request(app.getHttpServer() as Server)
        .get('/identity/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body.email).toBe(testUser.email);
    });
  });
});
