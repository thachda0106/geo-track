import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import {
  PrismaInstrumentation,
  registerInstrumentations,
} from '@prisma/instrumentation';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Buffer logs until nestjs-pino Logger is ready
    // This prevents unstructured console.log during bootstrap
    bufferLogs: true,
  });

  // ─── Use nestjs-pino as the application logger ──────
  // From this point, ALL NestJS internal logs (module init, route mapping, etc.)
  // will go through pino with structured JSON format
  app.useLogger(app.get(Logger));

  // ─── Get services ────────────────────────────────────
  const configService = app.get(ConfigService);

  // ─── Sentry Initialization ───────────────────────────
  const sentryDsn = configService.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    // Register Prisma OTel instrumentation BEFORE Sentry.init()
    // so that Sentry's OTel bridge can capture Prisma/PostGIS query spans
    registerInstrumentations({
      instrumentations: [new PrismaInstrumentation()],
    });

    Sentry.init({
      dsn: sentryDsn,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: configService.get<string>('NODE_ENV'),
    });

    // Hook Sentry into the Connect/Express error handler chain
    Sentry.setupConnectErrorHandler(app);
  }

  // ─── Security ────────────────────────────────────────
  app.use(helmet());

  // CORS
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:5173')
    .split(',');

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  // ─── API Prefix ──────────────────────────────────────
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix, {
    // Infrastructure endpoints live at root — no API prefix
    exclude: ['health', 'health/ready', 'metrics', 'internal/metrics'],
  });

  // ─── Validation Pipe (class-validator) ───────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true, // Auto-transform types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger (development only) ──────────────────────
  if (configService.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('GeoTrack API')
      .setDescription(
        'Geospatial Operations Platform — Geometry versioning, real-time tracking, and spatial queries',
      )
      .setVersion('0.1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'JWT',
      )
      .addTag('auth', 'Authentication & user management')
      .addTag('features', 'Geometry feature CRUD')
      .addTag('spatial', 'Spatial queries (intersect, buffer, etc.)')
      .addTag('versions', 'Version history & timeline')
      .addTag('tracking', 'GPS tracking sessions & locations')
      .addTag('health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  // ─── Graceful Shutdown ─────────────────────────────
  // Allows in-flight requests to drain on SIGTERM/SIGINT
  // and triggers onModuleDestroy() hooks (e.g., PrismaService.$disconnect())
  app.enableShutdownHooks();

  // ─── Start Server ────────────────────────────────────
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(`🚀 GeoTrack API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`🏥 Health check: http://localhost:${port}/health`);
  logger.log(`📊 Metrics: http://localhost:${port}/internal/metrics`);
  logger.log(`📊 Environment: ${configService.get('NODE_ENV')}`);
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start GeoTrack:', err);
  process.exit(1);
});
