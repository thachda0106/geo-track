import { Module } from '@nestjs/common';
import { GeometryController } from './geometry.controller';
import { SpatialController } from './spatial.controller';

// Use Cases
import { CreateFeatureUseCase } from './application/use-cases/create-feature.use-case';
import { UpdateFeatureUseCase } from './application/use-cases/update-feature.use-case';
import { DeleteFeatureUseCase } from './application/use-cases/delete-feature.use-case';

// Infrastructure / Ports
import { FEATURE_REPOSITORY } from './domain/repositories/feature.repository';
import { PrismaFeatureRepository } from './infrastructure/persistence/prisma-feature.repository';
import {
  FEATURE_QUERIES,
  SPATIAL_QUERIES,
} from './application/use-cases/queries/geometry-queries.interface';
import { PrismaGeometryQueries } from './infrastructure/persistence/prisma-geometry-queries';

@Module({
  controllers: [GeometryController, SpatialController],
  providers: [
    CreateFeatureUseCase,
    UpdateFeatureUseCase,
    DeleteFeatureUseCase,
    {
      provide: FEATURE_REPOSITORY,
      useClass: PrismaFeatureRepository,
    },
    {
      provide: FEATURE_QUERIES,
      useClass: PrismaGeometryQueries,
    },
    {
      provide: SPATIAL_QUERIES,
      useClass: PrismaGeometryQueries,
    },
  ],
})
export class GeometryModule {}
