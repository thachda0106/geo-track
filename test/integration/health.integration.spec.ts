import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from '../../libs/core/src/health/health.controller';
import { PrismaService } from '@app/core';

// ═══════════════════════════════════════════════════════
// Health Endpoint Integration Tests
//
// These tests verify:
// 1. Liveness probe returns 200 (process is alive)
// 2. Health endpoints are public (no auth required)
//
// Note: Readiness probe requires a running database,
// so we mock PrismaService for this test.
// ═══════════════════════════════════════════════════════

describe('Health Endpoints (Integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $connect: jest.fn(),
            $disconnect: jest.fn(),
            $queryRawUnsafe: jest.fn().mockResolvedValue([{ 1: 1 }]),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 for liveness probe', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
    });
  });
});
