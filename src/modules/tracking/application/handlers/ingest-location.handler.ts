import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { IngestLocationCommand } from '../commands/ingest-location.command';
import { Inject } from '@nestjs/common';
import { Producer } from 'kafkajs';

@CommandHandler(IngestLocationCommand)
export class IngestLocationHandler implements ICommandHandler<IngestLocationCommand> {
  constructor(
    // Injecting the raw Kafka producer (infrastructure detail abstractly typed)
    @Inject('KAFKA_PRODUCER_TOKEN') private readonly kafkaProducer: Producer,
  ) {}

  async execute(command: IngestLocationCommand): Promise<void> {
    // Serialize efficiently.
    const messageValue = Buffer.from(JSON.stringify(command));

    // We strictly partition by Device ID to guarantee chronological order downstream
    await this.kafkaProducer.send({
      topic: 'location.events',
      messages: [
        {
          key: command.deviceId,
          value: messageValue,
          timestamp: new Date(command.timestamp).getTime().toString(),
        },
      ],
      // Disable acks locally if we prioritize throughput over extreme durability at the edge,
      // but typically acks=1 or acks=all is required.
      acks: 1,
    });
  }
}
