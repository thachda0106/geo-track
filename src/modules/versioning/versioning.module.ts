import { Module } from '@nestjs/common';
import { VersioningController, FeatureVersionController } from './versioning.controller';
import { VersioningService } from './versioning.service';
import { VersioningConsumer } from './versioning.consumer';

@Module({
  controllers: [VersioningController, FeatureVersionController],
  providers: [VersioningService, VersioningConsumer],
  exports: [VersioningService],
})
export class VersioningModule {}

