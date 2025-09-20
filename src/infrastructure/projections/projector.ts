import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { FileEventStore } from '../eventstore/file-event-store';
import { SqliteOrderProjection } from './sqlite-projection';
import { CheckpointStore } from './checkpoint-store';
import type { OrderEvent } from '../../domain/aggregates/order';
import type { StoredEvent } from '../../domain/events';
import { setProjectorLag } from '../metrics/prom';

const PROJECTOR_NAME = 'order-sqlite-projector';
const DEFAULT_POLL_INTERVAL_MS = 500;

@Injectable()
export class OrderProjector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderProjector.name);
  private readonly pollIntervalMs: number;
  private running = false;
  private loopPromise: Promise<void> | null = null;

  constructor(
    private readonly eventStore: FileEventStore,
    private readonly projection: SqliteOrderProjection,
    private readonly checkpointStore: CheckpointStore
  ) {
    this.pollIntervalMs = Number(process.env.PROJECTOR_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
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
        const lastOffset = await this.checkpointStore.getLastOffset(PROJECTOR_NAME);
        const fromOffset = lastOffset === null ? 0 : lastOffset + 1;
        let processed = false;

        for await (const event of this.eventStore.stream(fromOffset)) {
          await this.handleEvent(event);
          await this.checkpointStore.saveLastOffset(PROJECTOR_NAME, event.offset);
          this.updateLagMetric(event);
          processed = true;
        }

        if (!processed) {
          await this.delay(this.pollIntervalMs);
        }
      } catch (error: unknown) {
        const err = error as Error;
        this.logger.error(`Projector loop failed: ${err.message}`, err.stack);
        await this.delay(this.pollIntervalMs);
      }
    }
  }

  private async handleEvent(event: StoredEvent): Promise<void> {
    if (!this.isOrderEvent(event)) {
      return;
    }

    try {
      this.projection.project(event);
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(
        `Failed to project event ${event.type}#${event.metadata.eventId}: ${err.message}`,
        err.stack
      );
      throw error;
    }
  }

  private updateLagMetric(event: StoredEvent): void {
    const eventTimestamp = Date.parse(event.metadata.ts);
    if (Number.isNaN(eventTimestamp)) {
      return;
    }

    const now = Date.now();
    const lagSeconds = Math.max(0, (now - eventTimestamp) / 1000);
    setProjectorLag(PROJECTOR_NAME, lagSeconds);
  }

  private isOrderEvent(event: StoredEvent): event is StoredEvent & OrderEvent {
    return event.type === 'order.created' || event.type === 'payment.requested';
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
