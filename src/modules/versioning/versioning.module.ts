import { Module } from '@nestjs/common';
import { OutboxModule } from '@app/core';
import { VersioningController, FeatureVersionController } from './versioning.controller';
import { VersioningService } from './versioning.service';
import { VersioningConsumer } from './versioning.consumer';

@Module({
  imports: [OutboxModule],
  controllers: [VersioningController, FeatureVersionController],
  providers: [VersioningService, VersioningConsumer],
  exports: [VersioningService],
})
export class VersioningModule {}

