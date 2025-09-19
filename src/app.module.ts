import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { MetricsController } from './infrastructure/metrics/metrics.controller';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [],
})
export class AppModule {}
