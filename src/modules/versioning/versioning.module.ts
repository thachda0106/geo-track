import { Module } from '@nestjs/common';
import { OutboxModule } from '@app/core';

// Controllers
import {
  VersioningController,
  FeatureVersionController,
} from './presentation/versioning.controller';

// Use Cases & Queries
import { RevertFeatureUseCase } from './application/use-cases/revert-feature.use-case';
import { VersioningQueriesService } from './application/use-cases/queries/versioning-queries.service';
import { CreateVersionUseCase } from './application/use-cases/create-version.use-case';

// Repositories
import { FEATURE_VERSION_REPOSITORY } from './domain/repositories/feature-version.repository';
import { PrismaFeatureVersionRepository } from './infrastructure/persistence/prisma-feature-version.repository';

// Consumers
import { VersioningConsumer } from './presentation/versioning.consumer';

@Module({
  imports: [OutboxModule],
  controllers: [VersioningController, FeatureVersionController],
  providers: [
    // Application
    RevertFeatureUseCase,
    VersioningQueriesService,
    CreateVersionUseCase,
    VersioningConsumer,

    // Infrastructure
    {
      provide: FEATURE_VERSION_REPOSITORY,
      useClass: PrismaFeatureVersionRepository,
    },
  ],
  exports: [VersioningQueriesService],
})
export class VersioningModule {}
