import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InboxService } from '@app/core';
import { VersioningService } from './versioning.service';

/**
 * Listens to domain events and creates versions idempotently.
 */
@Injectable()
export class VersioningConsumer {
  private readonly logger = new Logger(VersioningConsumer.name);

  constructor(
    private readonly inboxService: InboxService,
    private readonly versioningService: VersioningService,
  ) {}

  @OnEvent('FeatureCreated')
  async handleFeatureCreated(event: any) {
    // Process idempotently using the correlationId exactly as dispatched
    const eventId = event._correlationId;

    await this.inboxService.processOnce(
      eventId,
      'FeatureCreated',
      async () => {
        this.logger.log(`Processing FeatureCreated: Recording V1 for feature ${event.featureId}`);
        await this.versioningService.createInitialVersion({
          featureId: event.featureId,
          geometry: event.geometry,
          properties: event.properties,
          name: event.name,
          authorId: event.createdBy, 
        });
      }
    );
  }

  @OnEvent('FeatureUpdated')
  async handleFeatureUpdated(event: any) {
    const eventId = event._correlationId;

    await this.inboxService.processOnce(
      eventId,
      'FeatureUpdated',
      async () => {
        this.logger.log(`Processing FeatureUpdated: Recording V${event.versionNumber} for feature ${event.featureId}`);
        // Create full snapshot version based on event payload
        await this.versioningService.createVersionSnapshot({
          featureId: event.featureId,
          versionNumber: event.versionNumber,
          geometry: event.geometry,
          properties: event.properties,
          name: event.name,
          authorId: event.updatedBy,
        });
      }
    );
  }
}

