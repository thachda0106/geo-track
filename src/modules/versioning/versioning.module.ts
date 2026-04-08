import { Module } from '@nestjs/common';
import { VersioningController, FeatureVersionController } from './versioning.controller';
import { VersioningService } from './versioning.service';

@Module({
  controllers: [VersioningController, FeatureVersionController],
  providers: [VersioningService],
  exports: [VersioningService],
})
export class VersioningModule {}
