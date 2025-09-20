import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { ChannelModel, ConfirmChannel, Options } from 'amqplib';
import { connect } from 'amqplib';
import type { OutboxMessage } from './outbox-repo';

const DEFAULT_URL = 'amqp://guest:guest@localhost:5672';
const DEFAULT_QUEUE = 'orders.integration-events';

@Injectable()
export class RabbitIntegrationEventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitIntegrationEventPublisher.name);
  private readonly url: string;
  private readonly queue: string;
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private channelPromise: Promise<ConfirmChannel> | null = null;

  constructor() {
    this.url = process.env.RABBITMQ_URL ?? DEFAULT_URL;
    this.queue = process.env.RABBITMQ_OUTBOX_QUEUE ?? DEFAULT_QUEUE;
  }

  async publish(message: OutboxMessage): Promise<void> {
    const channel = await this.getChannel();
    const payload = Buffer.from(JSON.stringify(message.event), 'utf8');
    const options: Options.Publish = {
      contentType: 'application/json',
      messageId: message.messageId,
      deliveryMode: 2, // persistent
      headers: {
        aggregateId: message.event.metadata.aggregateId,
        eventType: message.event.type,
        attempts: message.attempts
      }
    };

    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(this.queue, payload, options, (err) => {
        if (err) {
          reject(err);
          return;
        }

        resolve();
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeChannel();
    await this.closeConnection();
  }

  private async getChannel(): Promise<ConfirmChannel> {
    if (!this.channelPromise) {
      this.channelPromise = this.createChannel();
    }

    return this.channelPromise;
  }

  private async createChannel(): Promise<ConfirmChannel> {
    this.logger.log(`Connecting to RabbitMQ at ${this.url}`);
    const connection = await connect(this.url);
    connection.on('error', (error: unknown) => {
      const err = error as Error;
      this.logger.error(`RabbitMQ connection error: ${err.message}`, err.stack);
    });
    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
      this.channel = null;
      this.channelPromise = null;
      this.connection = null;
    });

    const channel = await connection.createConfirmChannel();
    channel.on('error', (error: unknown) => {
      const err = error as Error;
      this.logger.error(`RabbitMQ channel error: ${err.message}`, err.stack);
    });
    channel.on('close', () => {
      this.logger.warn('RabbitMQ channel closed');
      this.channel = null;
      this.channelPromise = null;
    });

    await channel.assertQueue(this.queue, { durable: true });
    this.connection = connection;
    this.channel = channel;
    this.logger.log(`RabbitMQ queue ready: ${this.queue}`);
    return channel;
  }

  private async closeChannel(): Promise<void> {
    if (!this.channel) {
      return;
    }

    try {
      await this.channel.close();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(`Failed to close RabbitMQ channel cleanly: ${err.message}`);
    } finally {
      this.channel = null;
      this.channelPromise = null;
    }
  }

  private async closeConnection(): Promise<void> {
    if (!this.connection) {
      return;
    }

    try {
      await this.connection.close();
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.warn(`Failed to close RabbitMQ connection cleanly: ${err.message}`);
    } finally {
      this.connection = null;
    }
  }
}
