import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InboxService } from '@app/core';
import { CreateVersionUseCase } from './application/use-cases/create-version.use-case';

interface FeatureCreatedEvent {
  _correlationId: string;
  featureId: string;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  name: string;
  createdBy: string;
}

interface FeatureUpdatedEvent {
  _correlationId: string;
  featureId: string;
  versionNumber: number;
  geometry: Record<string, unknown>;
  properties: Record<string, unknown>;
  name: string;
  updatedBy: string;
}

/**
 * Listens to domain events and creates versions idempotently.
 */
@Injectable()
export class VersioningConsumer {
  private readonly logger = new Logger(VersioningConsumer.name);

  constructor(
    private readonly inboxService: InboxService,
    private readonly createVersionUseCase: CreateVersionUseCase,
  ) {}

  @OnEvent('FeatureCreated')
  async handleFeatureCreated(event: FeatureCreatedEvent) {
    // Process idempotently using the correlationId exactly as dispatched
    const eventId = event._correlationId;

    await this.inboxService.processOnce(eventId, 'FeatureCreated', async () => {
      this.logger.log(
        `Processing FeatureCreated: Recording V1 for feature ${event.featureId}`,
      );
      await this.createVersionUseCase.createInitialVersion({
        featureId: event.featureId,
        geometry: event.geometry,
        properties: event.properties,
        name: event.name,
        authorId: event.createdBy,
      });
    });
  }

  @OnEvent('FeatureUpdated')
  async handleFeatureUpdated(event: FeatureUpdatedEvent) {
    const eventId = event._correlationId;

    await this.inboxService.processOnce(eventId, 'FeatureUpdated', async () => {
      this.logger.log(
        `Processing FeatureUpdated: Recording V${event.versionNumber} for feature ${event.featureId}`,
      );
      // Create full snapshot version based on event payload
      await this.createVersionUseCase.createVersionSnapshot({
        featureId: event.featureId,
        versionNumber: event.versionNumber,
        geometry: event.geometry,
        properties: event.properties,
        name: event.name,
        authorId: event.updatedBy,
      });
    });
  }
}
