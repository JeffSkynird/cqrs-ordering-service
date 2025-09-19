import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  private readonly registry: Registry;
  private readonly httpHistogram: Histogram<string>;

  constructor() {
    this.registry = new Registry();
    // export default process metrics too
    collectDefaultMetrics({ register: this.registry });

    this.httpHistogram = new Histogram({
      name: 'http_server_request_duration_seconds',
      help: 'HTTP server request duration (seconds)',
      labelNames: ['method', 'route', 'status'] as const,
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
    });

    this.registry.registerMetric(this.httpHistogram);
    // Expose registry globally via (req as any) to avoid singletons
    (global as any).__metricsRegistry = this.registry;
    (global as any).__httpHistogram = this.httpHistogram;
  }

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1e9; // seconds
      const method = req.method.toUpperCase();
      // Nest sets route later; if not available, fallback to req.path
      const route = (req as any).route?.path || req.path || 'unknown';
      const status = res.statusCode.toString();

      (this.httpHistogram as Histogram<string>)
        .labels({ method, route, status })
        .observe(duration);
    });

    next();
  }
}

// Helpers for controllers
export function getRegistry(): Registry {
  return (global as any).__metricsRegistry as Registry;
}
