import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { MetricsMiddleware } from './infrastructure/metrics/metrics.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { abortOnError: true });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  // HTTP Metrics for all paths
  const metricsMiddleware = new MetricsMiddleware();
  app.use(metricsMiddleware.use.bind(metricsMiddleware));

  const PORT = Number(process.env.PORT || 8080);
  await app.listen(PORT);
  // eslint-disable-next-line no-console
  console.log(`[lab001] up on http://localhost:${PORT}  (/healthz, /metrics)`);
}

bootstrap();
