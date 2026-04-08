import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as Sentry from '@sentry/nestjs';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { AppModule } from './app.module';
import { AppLoggerService } from '@app/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // ─── Get services ────────────────────────────────────
  const configService = app.get(ConfigService);
  const logger = app.get(AppLoggerService);

  // ─── Sentry Initialization ───────────────────────────
  const sentryDsn = configService.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      environment: configService.get<string>('NODE_ENV'),
    });
  }

  // Use structured logger
  app.useLogger(logger);

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
    exclude: ['health', 'health/ready'], // Health checks at root
  });

  // ─── Validation Pipe (class-validator) ───────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // Strip unknown properties
      forbidNonWhitelisted: true, // Throw on unknown properties
      transform: true,          // Auto-transform types
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

    logger.log(`📚 Swagger docs: http://localhost:${configService.get('PORT')}/docs`, 'Bootstrap');
  }

  // ─── Graceful Shutdown ─────────────────────────────
  // Allows in-flight requests to drain on SIGTERM/SIGINT
  // and triggers onModuleDestroy() hooks (e.g., PrismaService.$disconnect())
  app.enableShutdownHooks();

  // ─── Start Server ────────────────────────────────────
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  logger.log(
    `🚀 GeoTrack API running on http://localhost:${port}/${apiPrefix}`,
    'Bootstrap',
  );
  logger.log(
    `🏥 Health check: http://localhost:${port}/health`,
    'Bootstrap',
  );
  logger.log(
    `📊 Environment: ${configService.get('NODE_ENV')}`,
    'Bootstrap',
  );
}

bootstrap().catch((err) => {
  console.error('❌ Failed to start GeoTrack:', err);
  process.exit(1);
});
