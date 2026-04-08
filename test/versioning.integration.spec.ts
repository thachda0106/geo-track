import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService, PrismaModule, OutboxModule } from '@app/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { VersioningModule } from '../src/modules/versioning/versioning.module';
import { VersioningQueriesService } from '../src/modules/versioning/application/use-cases/queries/versioning-queries.service';
import { CreateVersionUseCase } from '../src/modules/versioning/application/use-cases/create-version.use-case';
import { v4 as uuidv4 } from 'uuid';

describe('Versioning Integration (Integration)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let queriesService: VersioningQueriesService;
  let createVersionUseCase: CreateVersionUseCase;
  let testUserId: string;
  let testFeatureId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        EventEmitterModule.forRoot(),
        PrismaModule,
        OutboxModule,
        VersioningModule,
      ],
    }).compile();

    prisma = moduleRef.get<PrismaService>(PrismaService);
    queriesService = moduleRef.get<VersioningQueriesService>(
      VersioningQueriesService,
    );
    createVersionUseCase =
      moduleRef.get<CreateVersionUseCase>(CreateVersionUseCase);

    // Setup Test Admin User
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE email = 'versioning_test@test.com'`,
    );
    const [user] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO identity.users (email, password_hash, display_name, role)
       VALUES ('versioning_test@test.com', 'hash', 'Test Ver', 'admin')
       RETURNING id`,
    );
    testUserId = user.id;

    // We do not strictly need a real feature row if foreign checks are deferred, but let's insert a fake one.
    // However, versioning doesn't have an explicit FK to geometry.features (schema bounded context isolation), so we can just use a fake UUID.
    testFeatureId = uuidv4();
  });

  afterAll(async () => {
    await prisma.$queryRawUnsafe(
      `DELETE FROM versioning.versions WHERE author_id = $1::uuid`,
      testUserId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM identity.users WHERE id = $1::uuid`,
      testUserId,
    );
    await moduleRef.close();
  });

  describe('createInitialVersion & listVersions', () => {
    it('should create an initial version correctly via PostGIS', async () => {
      const geoJson = {
        type: 'Point',
        coordinates: [100.0, 0.0],
      };

      await createVersionUseCase.createInitialVersion({
        featureId: testFeatureId,
        geometry: geoJson,
        properties: { name: 'Initial Version' },
        name: 'Initial Point',
        authorId: testUserId,
      });

      const history = await queriesService.listVersions(testFeatureId, {});
      expect(history.data.length).toBe(1);
      expect(history.data[0].versionNumber).toBe(1);
      expect(history.data[0].changeType).toBe('created');
    });
  });

  describe('createVersionSnapshot', () => {
    it('should increment version correctly on update', async () => {
      const geoJson = {
        type: 'Point',
        coordinates: [101.0, 1.0],
      };

      await createVersionUseCase.createVersionSnapshot({
        featureId: testFeatureId,
        versionNumber: 2,
        geometry: geoJson,
        properties: { name: 'Moved Point' },
        name: 'Moved Point',
        authorId: testUserId,
      });

      const history = await queriesService.listVersions(testFeatureId, {});
      expect(history.data.length).toBe(2);

      const v2 = history.data.find((h) => h.versionNumber === 2);
      expect(v2).toBeDefined();
      expect(v2!.changeType).toBe('updated');
    });
  });
});
