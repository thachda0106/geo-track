import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppLoggerService, PrismaService, HttpErrorFilter } from '@app/core';
import { APP_FILTER } from '@nestjs/core';

// ═══════════════════════════════════════════════════════
// Test Application Factory
// ═══════════════════════════════════════════════════════

export const TEST_JWT_SECRET = 'test-jwt-secret-minimum-32-characters-long!!';

/**
 * Creates a NestJS test application with common configuration.
 *
 * Usage:
 * ```typescript
 * const { app, module } = await createTestApp({
 *   imports: [IdentityModule],
 * });
 * ```
 */
export async function createTestApp(options: {
  imports?: any[];
  providers?: any[];
  controllers?: any[];
}): Promise<{ app: INestApplication; module: TestingModule }> {
  const moduleBuilder = Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [
          () => ({
            NODE_ENV: 'test',
            PORT: 3001,
            API_PREFIX: 'api/v1',
            DATABASE_URL:
              process.env.DATABASE_URL ||
              'postgresql://geotrack:geotrack_dev@localhost:5432/geotrack_test',
            REDIS_HOST: 'localhost',
            REDIS_PORT: 6379,
            KAFKA_BROKERS: 'localhost:9092',
            JWT_SECRET: TEST_JWT_SECRET,
            JWT_ACCESS_EXPIRATION: '15m',
            JWT_REFRESH_EXPIRATION: '7d',
            CORS_ORIGINS: 'http://localhost:3001',
            LOG_LEVEL: 'debug', // Enable logs to debug e2e failures
            LOG_PRETTY: 'false',
          }),
        ],
      }),
      JwtModule.register({
        secret: TEST_JWT_SECRET,
        signOptions: { expiresIn: '15m', algorithm: 'HS256' },
      }),
      ...(options.imports || []),
    ],
    providers: [
      AppLoggerService,
      {
        provide: APP_FILTER,
        useClass: HttpErrorFilter,
      },
      ...(options.providers || []),
    ],
    controllers: options.controllers || [],
  });

  const module = await moduleBuilder.compile();
  const app = module.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready'],
  });

  await app.init();

  return { app, module };
}

/**
 * Creates a mock PrismaService for unit tests.
 * All methods return jest.fn() by default.
 */
export function createMockPrismaService(): Partial<PrismaService> {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any,
    inbox: {
      findUnique: jest.fn(),
      create: jest.fn(),
    } as any,
    trackingSession: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as any,
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };
}

/**
 * Creates a mock AppLoggerService for unit tests.
 */
export function createMockLogger(): Partial<AppLoggerService> {
  return {
    log: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
    child: jest.fn(),
  };
}
