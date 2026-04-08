import { Module } from '@nestjs/common';
import { TrackingController, TrackingIngestController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  controllers: [TrackingController, TrackingIngestController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
