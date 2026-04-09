import * as request from 'supertest';
import { E2ETestHarness } from './helpers/e2e-test-harness';

describe('Feature Lifecycle (e2e) Vertical Slice', () => {
  const harness = new E2ETestHarness();
  let adminToken: string;
  let testUserId: string;

  beforeAll(async () => {
    await harness.setup();

    // 1. Setup Test Admin User
    await harness.prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = 'admin@test.com'`,
    );
    const [user] = await harness.prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('admin@test.com', 'hash', 'Test Admin', 'admin')
       RETURNING id`,
    );
    testUserId = user.id;

    // 2. Generate Token using the harness
    adminToken = harness.generateToken({
      sub: testUserId,
      email: 'admin@test.com',
      role: 'admin',
    });
  });

  afterAll(async () => {
    await harness.teardown(async (prisma) => {
      await prisma.$executeRawUnsafe(
        `DELETE FROM identity.users WHERE id = $1::uuid`,
        testUserId,
      );
    });
  });

  it('should create a feature, relay the event, and record version 1 snapshot', async () => {
    // 1. Create a feature via HTTP (Geometry Module)
    const createRes = await request(harness.server)
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

    if (createRes.status !== 201) {
      console.log('CREATE RES BODY:', createRes.body);
    }

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.currentVersion).toBe(1);

    const featureId = createRes.body.id;

    // 2. Wait for Event Relay (Cron runs every second)
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 3. Verify Versioning Module consumed the event
    const versionsRes = await request(harness.server)
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
