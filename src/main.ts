import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { httpMetricsMiddleware } from './infrastructure/metrics/prom';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create(AppModule, { abortOnError: true });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );

  // HTTP Metrics for all paths
  app.use(httpMetricsMiddleware);

  const PORT = Number(process.env.PORT || 8080);
  await app.listen(PORT);
  // eslint-disable-next-line no-console
  console.log(`[lab001] up on http://localhost:${PORT}  (/healthz, /metrics)`);
}

bootstrap();
