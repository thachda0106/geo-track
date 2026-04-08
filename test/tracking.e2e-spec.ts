import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@app/core';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'http';

describe('Tracking API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let editorToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    // Setup Test User
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = 'tracking_e2e@test.com'`,
    );
    const [user] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('tracking_e2e@test.com', 'hash', 'Test Tracker', 'editor')
       RETURNING id`,
    );
    testUserId = user.id;

    editorToken = jwtService.sign({
      sub: testUserId,
      email: 'tracking_e2e@test.com',
      role: 'editor',
    });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM tracking.sessions WHERE owner_id = $1::uuid`,
      testUserId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE id = $1::uuid`,
      testUserId,
    );
    await app.close();
  });

  describe('Tracking Session Flow', () => {
    let sessionId: string;
    const testDeviceId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

    it('should create a new tracking session', async () => {
      const res = await request(app.getHttpServer() as Server)
        .post('/tracking-sessions')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          name: 'Operation Alpha Track',
          deviceId: testDeviceId,
          config: { minIntervalMs: 2000 },
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('active');
      sessionId = res.body.id;
    });

    it('should close the tracking session', async () => {
      const res = await request(app.getHttpServer() as Server)
        .patch(`/tracking-sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);

      expect(res.body.status).toBe('ended');
    });

    it('should list all sessions for the user', async () => {
      const res = await request(app.getHttpServer() as Server)
        .get('/tracking-sessions')
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.find((s: Record<string, unknown>) => s.id === sessionId),
      ).toBeDefined();
    });
  });
});
