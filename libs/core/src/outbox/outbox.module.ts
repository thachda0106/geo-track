import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { InboxService } from './inbox.service';

/**
 * Outbox/Inbox Module.
 * Provides transactional outbox (at-least-once delivery)
 * and inbox deduplication (idempotent processing).
 */
@Global()
@Module({
  providers: [OutboxService, InboxService],
  exports: [OutboxService, InboxService],
})
export class OutboxModule {}
