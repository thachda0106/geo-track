import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Consumer, Kafka, Producer } from 'kafkajs';
import { PrismaService } from '@app/core';

@Injectable()
export class ResilientTrackingConsumer implements OnModuleInit {
  private consumer: Consumer;
  private dlqProducer: Producer;
  private readonly logger = new Logger(ResilientTrackingConsumer.name);

  constructor(private prisma: PrismaService) {
    const kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
    });
    this.consumer = kafka.consumer({ groupId: 'tracking-workers' });
    this.dlqProducer = kafka.producer();
  }

  async onModuleInit() {
    await this.dlqProducer.connect();
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: 'location.events',
      fromBeginning: false,
    });

    // Extreme Manual Control for Resilience
    await this.consumer.run({
      autoCommit: false, // CRITICAL: Never auto-commit in high-reliability scenarios
      partitionsConsumedConcurrently: 3,
      eachBatchAutoResolve: false,
      eachBatch: async (payload) => {
        for (const message of payload.batch.messages) {
          if (!message.value) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(message.value.toString()) as Record<
              string,
              unknown
            >;
            // Business Logic (DB Upsert omitted for brevity, ensure $transaction!)
            await this.processMessageDatabase(parsed);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorStack =
              error instanceof Error && error.stack ? error.stack : '';
            this.logger.error(
              `Poison Pill ignored offset ${message.offset}: ${errorMessage}`,
            );
            // Push to DLQ with headers containing diagnostic context
            await this.dlqProducer.send({
              topic: 'location.dlq',
              messages: [
                {
                  key: message.key, // Maintain partitioning
                  value: message.value,
                  headers: {
                    OriginalTopic: payload.batch.topic,
                    OriginalOffset: message.offset,
                    OriginalPartition: payload.batch.partition.toString(),
                    ExceptionMessage: errorMessage,
                    Stack: errorStack,
                    Timestamp: Date.now().toString(),
                  },
                },
              ],
            });
            // CRITICAL: We caught the error and routed it. Now resolve the offset so we don't crash loop.
          }
          payload.resolveOffset(message.offset);
          await payload.heartbeat();
        }
        await payload.commitOffsetsIfNecessary();
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async processMessageDatabase(data: Record<string, unknown>) {
    // Database interaction here...
  }
}
