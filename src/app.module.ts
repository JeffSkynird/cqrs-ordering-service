import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { MetricsController } from './infrastructure/metrics/metrics.controller';
import { OrdersController } from './infrastructure/http/orders.controller';
import { FileEventStore } from './infrastructure/eventstore/file-event-store';
import { CreateOrderHandler } from './application/handlers/create-order.handler';
import { ProjectionDatabase, SqliteOrderProjection } from './infrastructure/projections/sqlite-projection';
import { CheckpointStore } from './infrastructure/projections/checkpoint-store';
import { OrderProjector } from './infrastructure/projections/projector';
import { OutboxRepository } from './infrastructure/outbox/outbox-repo';
import { OutboxDispatcher } from './infrastructure/outbox/dispatcher';
import { RabbitIntegrationEventPublisher } from './infrastructure/outbox/rabbit-publisher';

@Module({
  controllers: [HealthController, MetricsController, OrdersController],
  providers: [
    FileEventStore,
    CreateOrderHandler,
    ProjectionDatabase,
    SqliteOrderProjection,
    CheckpointStore,
    OrderProjector,
    OutboxRepository,
    RabbitIntegrationEventPublisher,
    OutboxDispatcher
  ]
})
export class AppModule {}
