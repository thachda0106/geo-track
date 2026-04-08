import { Module } from '@nestjs/common';
import { GeometryController, SpatialController } from './geometry.controller';
import { GeometryService } from './geometry.service';
import { SpatialQueryService } from './spatial-query.service';

@Module({
  controllers: [GeometryController, SpatialController],
  providers: [GeometryService, SpatialQueryService],
  exports: [GeometryService],
})
export class GeometryModule {}
