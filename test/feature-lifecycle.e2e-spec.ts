import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@app/core';
import { JwtService } from '@nestjs/jwt';

describe('Feature Lifecycle (e2e) Vertical Slice', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let adminToken: string;
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

    // 1. Setup Test Admin User
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE email = 'admin@test.com'`);
    const [user] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('admin@test.com', 'hash', 'Test Admin', 'admin')
       RETURNING id`
    );
    testUserId = user.id;

    // 2. Generate Token manually for bypassing actual login
    adminToken = jwtService.sign({ sub: testUserId, email: 'admin@test.com', role: 'admin' });
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE id = $1::uuid`, testUserId);
    await app.close();
  });

  it('should create a feature, relay the event, and record version 1 snapshot', async () => {
    // 1. Create a feature via HTTP (Geometry Module)
    const createRes = await request(app.getHttpServer())
      .post('/features')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Test Vertical Slice Feature',
        description: 'Testing event relay',
        geometryType: 'Point',
        geometry: {
          type: 'Point',
          coordinates: [106.6, 10.8],
        },
        properties: { status: 'active' },
        tags: ['test'],
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.currentVersion).toBe(1);

    const featureId = createRes.body.id;

    // 2. Wait for Event Relay (Cron runs every second)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 3. Verify Versioning Module consumed the event
    const versionsRes = await request(app.getHttpServer())
      .get(`/features/${featureId}/versions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(versionsRes.body.data.length).toBe(1); // Should have exactly 1 version recorded
    const v1 = versionsRes.body.data[0];
    
    expect(v1.versionNumber).toBe(1);
    expect(v1.changeType).toBe('created');
    expect(v1.author.id).toBe(testUserId);
  });
});
