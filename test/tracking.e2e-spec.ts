import * as request from 'supertest';
import { E2ETestHarness } from './helpers/e2e-test-harness';

describe('Tracking API (e2e)', () => {
  const harness = new E2ETestHarness();
  let editorToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await harness.setup();

    // Setup Test User
    await harness.prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = 'tracking_e2e@test.com'`,
    );
    const [user] = await harness.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('tracking_e2e@test.com', 'hash', 'Test Tracker', 'editor')
       RETURNING id`,
    );
    testUserId = user.id;

    editorToken = harness.generateToken({
      sub: testUserId,
      email: 'tracking_e2e@test.com',
      role: 'editor',
    });
  });

  afterAll(async () => {
    await harness.teardown(async (prisma) => {
      await prisma.$executeRawUnsafe(
        `DELETE FROM tracking.sessions WHERE owner_id = $1::uuid`,
        testUserId,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM identity.users WHERE id = $1::uuid`,
        testUserId,
      );
    });
  });

  describe('Tracking Session Flow', () => {
    let sessionId: string;
    const testDeviceId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';

    it('should create a new tracking session', async () => {
      const res = await request(harness.server)
        .post('/tracking-sessions')
        .set('Authorization', `Bearer ${editorToken}`)
        .send({
          deviceId: testDeviceId,
          config: { minIntervalMs: 2000 },
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('active');
      sessionId = res.body.id;
    });

    it('should close the tracking session', async () => {
      const res = await request(harness.server)
        .patch(`/tracking-sessions/${sessionId}/end`)
        .set('Authorization', `Bearer ${editorToken}`)
        .expect(200);

      expect(res.body.status).toBe('ended');
    });

    it('should list all sessions for the user', async () => {
      const res = await request(harness.server)
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
