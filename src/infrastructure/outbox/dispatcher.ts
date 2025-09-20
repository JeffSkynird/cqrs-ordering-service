import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxRepository, OutboxMessage } from './outbox-repo';
import { RabbitIntegrationEventPublisher } from './rabbit-publisher';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_BASE_BACKOFF_MS = 500;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

@Injectable()
export class OutboxDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private injectedFailureConsumed = false;

  constructor(
    private readonly repository: OutboxRepository,
    private readonly publisher: RabbitIntegrationEventPublisher
  ) {
    this.pollIntervalMs = Number(
      process.env.OUTBOX_DISPATCHER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS
    );
    this.batchSize = Number(process.env.OUTBOX_DISPATCHER_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
    this.maxAttempts = Number(
      process.env.OUTBOX_DISPATCHER_MAX_ATTEMPTS ?? DEFAULT_MAX_ATTEMPTS
    );
    this.baseBackoffMs = Number(
      process.env.OUTBOX_DISPATCHER_BASE_BACKOFF_MS ?? DEFAULT_BASE_BACKOFF_MS
    );
    this.maxBackoffMs = Number(
      process.env.OUTBOX_DISPATCHER_MAX_BACKOFF_MS ?? DEFAULT_MAX_BACKOFF_MS
    );
  }

  async onModuleInit(): Promise<void> {
    this.running = true;
    this.loopPromise = this.runLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise;
    }
  }

  private async runLoop(): Promise<void> {
    while (this.running) {
      try {
        const messages = this.repository.getPendingMessages(this.batchSize);
        if (messages.length === 0) {
          await this.delay(this.pollIntervalMs);
          continue;
        }

        for (const message of messages) {
          await this.processMessage(message);
        }
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.error(`Outbox dispatcher loop failed: ${err.message}`, err.stack);
        await this.delay(this.pollIntervalMs);
      }
    }
  }

  private async processMessage(message: OutboxMessage): Promise<void> {
    try {
      await this.dispatchMessage(message);
      this.repository.markAsSent(message.messageId);
      this.logger.log(
        `Dispatched integration event ${message.event.type} for aggregate ${message.event.metadata.aggregateId}`
      );
    } catch (error: unknown) {
      const err = error as Error;
      const attempts = message.attempts + 1;
      const errorMessage = err.message ?? 'unknown dispatch error';

      if (attempts >= this.maxAttempts) {
        this.logger.error(
          `Outbox message ${message.messageId} failed after ${attempts} attempts: ${errorMessage}`,
          err.stack
        );
        this.repository.markAsFailed(message.messageId, attempts, errorMessage);
        return;
      }

      const backoffMs = this.calculateBackoff(attempts);
      const nextAttemptAt = new Date(Date.now() + backoffMs).toISOString();
      this.logger.warn(
        `Outbox message ${message.messageId} dispatch failed (attempt ${attempts}): ${errorMessage}. Retrying in ${backoffMs}ms`
      );
      this.repository.recordDispatchError(message.messageId, attempts, nextAttemptAt, errorMessage);
    }
  }

  private async dispatchMessage(message: OutboxMessage): Promise<void> {
    if (this.shouldSimulateFailure(message)) {
      throw new Error('Simulated dispatch failure');
    }

    await this.publisher.publish(message);
  }

  private shouldSimulateFailure(message: OutboxMessage): boolean {
    const failOnce = process.env.OUTBOX_DISPATCHER_FAIL_ONCE === 'true';
    if (failOnce && !this.injectedFailureConsumed) {
      this.injectedFailureConsumed = true;
      return true;
    }

    const failEventType = process.env.OUTBOX_DISPATCHER_FAIL_EVENT_TYPE;
    if (failEventType && message.event.type === failEventType) {
      return true;
    }

    const failOnAttempts = process.env.OUTBOX_DISPATCHER_FAIL_UNTIL_ATTEMPTS;
    if (failOnAttempts) {
      const threshold = Number(failOnAttempts);
      if (Number.isInteger(threshold) && message.attempts < threshold) {
        return true;
      }
    }

    return false;
  }

  private calculateBackoff(attempts: number): number {
    const exponential = this.baseBackoffMs * Math.pow(2, Math.max(0, attempts - 1));
    return Math.min(exponential, this.maxBackoffMs);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
