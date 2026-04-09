import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@app/core';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'http';

/**
 * Reusable E2E test harness that manages NestJS lifecycle safely.
 *
 * Solves the PrismaService teardown regression — saves DI references
 * BEFORE app.close() destroys the container.
 *
 * @example
 * ```typescript
 * const harness = new E2ETestHarness();
 *
 * beforeAll(() => harness.setup());
 * afterAll(() => harness.teardown(async (prisma) => {
 *   await prisma.$executeRawUnsafe('DELETE FROM ...');
 * }));
 *
 * it('test', async () => {
 *   await request(harness.server).get('/health').expect(200);
 * });
 * ```
 */
export class E2ETestHarness {
  private _app!: INestApplication;
  private _prisma!: PrismaService;
  private _jwtService!: JwtService;
  private _module!: TestingModule;

  get app(): INestApplication {
    return this._app;
  }

  get prisma(): PrismaService {
    return this._prisma;
  }

  get jwtService(): JwtService {
    return this._jwtService;
  }

  get server(): Server {
    return this._app.getHttpServer() as Server;
  }

  /**
   * Bootstrap the full application.
   * Saves PrismaService and JwtService references immediately after init.
   */
  async setup(options?: {
    envOverrides?: Record<string, string>;
  }): Promise<void> {
    // Apply env overrides before module compilation
    if (options?.envOverrides) {
      Object.assign(process.env, options.envOverrides);
    }

    this._module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    this._app = this._module.createNestApplication();
    this._app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await this._app.init();

    // ┌─────────────────────────────────────────────────────────┐
    // │ CRITICAL: Save references BEFORE any teardown can occur │
    // │ app.close() destroys the DI container, making           │
    // │ app.get(PrismaService) return undefined after close.    │
    // └─────────────────────────────────────────────────────────┘
    this._prisma = this._app.get(PrismaService);
    this._jwtService = this._app.get(JwtService);
  }

  /**
   * Generate a signed JWT for test authentication.
   */
  generateToken(payload: {
    sub: string;
    email: string;
    role: 'viewer' | 'editor' | 'admin';
  }): string {
    return this._jwtService.sign(payload);
  }

  /**
   * Safe teardown: runs cleanup queries BEFORE closing the app.
   *
   * @param cleanupFn - Optional function that receives the saved PrismaService
   *                     reference to perform DB cleanup.
   */
  async teardown(
    cleanupFn?: (prisma: PrismaService) => Promise<void>,
  ): Promise<void> {
    try {
      // Step 1: Run cleanup using the SAVED prisma reference
      if (cleanupFn && this._prisma) {
        await cleanupFn(this._prisma);
      }
    } catch (err) {
      // Don't let cleanup failure prevent app shutdown
      console.error('E2E teardown cleanup failed:', err);
    } finally {
      // Step 2: Close app AFTER cleanup is complete
      if (this._app) {
        await this._app.close();
      }
    }
  }
}
