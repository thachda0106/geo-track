import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, PrismaModule } from '@app/core';
import { ConfigModule } from '@nestjs/config';
import { GeometryModule } from '../src/modules/geometry/geometry.module';
import { GeometryService } from '../src/modules/geometry/geometry.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

describe('Geometry Integration (Integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let geometryService: GeometryService;
  let testUserId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        PrismaModule,
        GeometryModule
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    geometryService = moduleRef.get<GeometryService>(GeometryService);

    // Setup Test Admin User for auth relations
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE email = 'geometry_test@test.com'`);
    const [user] = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('geometry_test@test.com', 'hash', 'Test Geo', 'admin')
       RETURNING id`
    );
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.$queryRawUnsafe(`DELETE FROM geometry.features WHERE created_by = $1::uuid`, testUserId);
    await prisma.$executeRawUnsafe(`DELETE FROM identity.users WHERE id = $1::uuid`, testUserId);
    await moduleRef.close();
  });

  describe('createFeature & getFeature', () => {
    it('should insert a feature with PostGIS geometry and retrieve it', async () => {
      const dto = {
        name: 'Integration Test Point',
        geometryType: 'Point' as const,
        geometry: {
          type: 'Point',
          coordinates: [106.6, 10.8],
        },
        properties: { status: 'testing' },
        tags: ['integration'],
      };

      const result = await geometryService.createFeature(dto, testUserId);
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Integration Test Point');
      expect(result.geometry.type).toBe('Point');
      expect(result.geometry.coordinates).toEqual([106.6, 10.8]);

      const fetched = await geometryService.getFeature(result.id);
      expect(fetched.id).toBe(result.id);
      expect(fetched.geometryType).toBe('Point');
      expect(fetched.geometry.coordinates).toEqual([106.6, 10.8]);
    });
  });

  describe('listFeatures', () => {
    it('should filter features by spatial bounding box', async () => {
      // BBox contains [106.6, 10.8]
      const results = await geometryService.listFeatures({
        bbox: '106.0,10.0,107.0,11.0',
        createdBy: testUserId,
      });

      expect(results.data.length).toBeGreaterThan(0);
      expect(results.data[0].name).toBe('Integration Test Point');

      // BBox explicitly outside [106.6, 10.8]
      const emptyResults = await geometryService.listFeatures({
        bbox: '-10,-10,0,0',
        createdBy: testUserId,
      });

      expect(emptyResults.data.length).toBe(0);
    });
  });
});
