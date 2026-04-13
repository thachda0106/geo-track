import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { Request, Response } from 'express';

/**
 * HTTP Metrics Interceptor — collects RED metrics for every HTTP request.
 *
 * RED = Rate, Errors, Duration (the golden signals for API monitoring)
 *
 * Metrics collected:
 * ┌──────────────────────────────────┬─────────┬──────────────────────────────┐
 * │ Metric Name                      │ Type    │ Purpose                      │
 * ├──────────────────────────────────┼─────────┼──────────────────────────────┤
 * │ http_requests_total              │ Counter │ Total requests (Rate)        │
 * │ http_request_duration_seconds    │ Histo.  │ Latency distribution (p50/99)│
 * │ http_requests_errors_total       │ Counter │ 4xx + 5xx errors (Errors)    │
 * └──────────────────────────────────┴─────────┴──────────────────────────────┘
 *
 * Labels: method, route, status_code
 *
 * How to query in Grafana:
 *   Rate:     rate(http_requests_total[5m])
 *   Errors:   rate(http_requests_errors_total[5m]) / rate(http_requests_total[5m])
 *   Duration: histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly requestCounter: Counter<string>,

    @InjectMetric('http_request_duration_seconds')
    private readonly requestDuration: Histogram<string>,

    @InjectMetric('http_requests_errors_total')
    private readonly errorCounter: Counter<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const startTime = Date.now();

    // Normalize route pattern (e.g., /api/v1/features/:id → /api/v1/features/:id)
    // This prevents high-cardinality label explosion from dynamic params
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;

    return next.handle().pipe(
      tap({
        next: () => {
          const res = httpContext.getResponse<Response>();
          const statusCode = res.statusCode.toString();
          const duration = (Date.now() - startTime) / 1000; // seconds

          // Rate: increment total counter
          this.requestCounter.inc({ method, route, status_code: statusCode });

          // Duration: observe latency
          this.requestDuration.observe({ method, route, status_code: statusCode }, duration);

          // Errors: count 4xx and 5xx
          if (res.statusCode >= 400) {
            this.errorCounter.inc({ method, route, status_code: statusCode });
          }
        },
        error: (err: { status?: number; getStatus?: () => number }) => {
          const statusCode = (err?.status || err?.getStatus?.() || 500).toString();
          const duration = (Date.now() - startTime) / 1000;

          this.requestCounter.inc({ method, route, status_code: statusCode });
          this.requestDuration.observe({ method, route, status_code: statusCode }, duration);
          this.errorCounter.inc({ method, route, status_code: statusCode });
        },
      }),
    );
  }
}
