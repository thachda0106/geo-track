import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, PrismaModule } from '@app/core';
import { ConfigModule } from '@nestjs/config';
import { TrackingModule } from '../src/modules/tracking/tracking.module';
import { TrackingService } from '../src/modules/tracking/tracking.service';
import { v4 as uuidv4 } from 'uuid';

describe('Tracking Integration (Integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let trackingService: TrackingService;
  let testUserId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, TrackingModule],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    trackingService = moduleRef.get<TrackingService>(TrackingService);

    // Setup Test User
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE email = 'tracking_test@test.com'`);
    const [user] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('tracking_test@test.com', 'hash', 'Test Track', 'admin')
       RETURNING id`
    );
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup generated sessions (will cascade to tracks if relations exist)
    await prisma.trackingSession.deleteMany({
      where: { ownerId: testUserId }
    });
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE id = $1::uuid`, testUserId);
    await moduleRef.close();
  });

  describe('Session Management', () => {
    it('should create a session out of raw requests', async () => {
      const deviceId = uuidv4();
      
      const session = await trackingService.createSession(
        {
          deviceId,
          config: { minIntervalMs: 2000 }
        },
        testUserId
      );

      expect(session.id).toBeDefined();
      expect(session.deviceId).toBe(deviceId);
      expect(session.config.minIntervalMs).toBe(2000);
      expect(session.status).toBe('active');

      const listed = await trackingService.listSessions(testUserId);
      expect(listed.data.find(s => s.id === session.id)).toBeDefined();

      const ended = await trackingService.endSession(session.id);
      expect(ended.status).toBe('ended');
    });
  });

  // Note: we might skip ingestLocations if location_points table isn't fully provisioned in Prisma,
  // but if it is, the test will catch any missing table definitions.
});
