import type { NextFunction, Request, Response } from 'express';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequestDurationSeconds = new Histogram({
  name: 'http_server_request_duration_seconds',
  help: 'HTTP server request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});
registry.registerMetric(httpRequestDurationSeconds);

const httpResponsesTotal = new Counter({
  name: 'http_server_responses_total',
  help: 'Total HTTP responses grouped by status class',
  labelNames: ['method', 'route', 'status_class'] as const
});
registry.registerMetric(httpResponsesTotal);

const projectorLagSeconds = new Gauge({
  name: 'projector_event_lag_seconds',
  help: 'Lag in seconds between the latest processed event and now',
  labelNames: ['projector'] as const
});
registry.registerMetric(projectorLagSeconds);

function routeLabel(req: Request): string {
  const route = (req as any).route?.path;
  if (route) {
    return route;
  }

  if (req.baseUrl && req.path) {
    return `${req.baseUrl}${req.path}`;
  }

  return req.originalUrl?.split('?')[0] ?? 'unknown';
}

function statusClassLabel(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) {
    return '2xx';
  }

  if (statusCode >= 300 && statusCode < 400) {
    return '3xx';
  }

  if (statusCode >= 400 && statusCode < 500) {
    return '4xx';
  }

  if (statusCode >= 500 && statusCode < 600) {
    return '5xx';
  }

  return 'other';
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNanos = process.hrtime.bigint() - start;
    const durationSeconds = Number(durationNanos) / 1e9;
    const method = req.method.toUpperCase();
    const route = routeLabel(req);
    const statusCode = res.statusCode;
    const status = statusCode.toString();
    const statusClass = statusClassLabel(statusCode);

    httpRequestDurationSeconds.labels({ method, route, status }).observe(durationSeconds);
    httpResponsesTotal.labels({ method, route, status_class: statusClass }).inc();
  });

  next();
}

export function getRegistry(): Registry {
  return registry;
}

export function setProjectorLag(projector: string, lagSeconds: number): void {
  const safeLag = Number.isFinite(lagSeconds) && lagSeconds >= 0 ? lagSeconds : 0;
  projectorLagSeconds.labels({ projector }).set(safeLag);
}
