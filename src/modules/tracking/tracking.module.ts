import { Module } from '@nestjs/common';
import { TrackingController } from './presentation/tracking-sessions.controller';
import { TrackingIngestController } from './presentation/tracking-ingest.controller';

// Use Cases & Services
import { StartSessionUseCase } from './application/use-cases/start-session.use-case';
import { EndSessionUseCase } from './application/use-cases/end-session.use-case';
import { IngestLocationsUseCase } from './application/use-cases/ingest-locations.use-case';
import { TrackingQueriesService } from './application/use-cases/queries/tracking-queries.service';

// Repositories (Interfaces & Prisma Implementations)
import { TRACKING_SESSION_REPOSITORY } from './domain/repositories/tracking-session.repository';
import { PrismaTrackingSessionRepository } from './infrastructure/persistence/prisma-tracking-session.repository';
import { LOCATION_REPOSITORY } from './domain/repositories/location.repository';
import { PrismaLocationRepository } from './infrastructure/persistence/prisma-location.repository';

@Module({
  controllers: [TrackingController, TrackingIngestController],
  providers: [
    // Application Layer
    StartSessionUseCase,
    EndSessionUseCase,
    IngestLocationsUseCase,
    TrackingQueriesService,

    // Infrastructure Layer (DI Bindings)
    {
      provide: TRACKING_SESSION_REPOSITORY,
      useClass: PrismaTrackingSessionRepository,
    },
    {
      provide: LOCATION_REPOSITORY,
      useClass: PrismaLocationRepository,
    },
  ],
  exports: [TrackingQueriesService],
})
export class TrackingModule {}
