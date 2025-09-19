import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { MetricsController } from './infrastructure/metrics/metrics.controller';
import { OrdersController } from './infrastructure/http/orders.controller';
import { FileEventStore } from './infrastructure/eventstore/file-event-store';
import { CreateOrderHandler } from './application/handlers/create-order.handler';

@Module({
  controllers: [HealthController, MetricsController, OrdersController],
  providers: [FileEventStore, CreateOrderHandler],
})
export class AppModule {}
