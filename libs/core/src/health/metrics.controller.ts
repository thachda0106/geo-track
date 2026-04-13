import { Controller, Get, Res } from '@nestjs/common';
import { Public } from '../auth/roles.decorator';
import { Response } from 'express';
import { register } from 'prom-client';

/**
 * Metrics Controller — exposes Prometheus metrics at /internal/metrics.
 *
 * WHY /internal/metrics instead of /metrics:
 * - @willsoto/nestjs-prometheus registers its own controller at /metrics
 * - That controller lacks @Public(), so JWT guard blocks Prometheus scrapers
 * - Instead of fighting the library, we register our own @Public() endpoint
 *   at /internal/metrics and configure Prometheus to scrape this path
 *
 * WHAT gets exposed:
 * - Default Node.js metrics (CPU, memory, event loop lag, GC)
 * - Custom RED metrics from HttpMetricsInterceptor:
 *   - http_requests_total (counter)
 *   - http_request_duration_seconds (histogram)
 *   - http_requests_errors_total (counter)
 *
 * Prometheus scrape config:
 *   scrape_configs:
 *     - job_name: 'geotrack'
 *       scrape_interval: 15s
 *       metrics_path: /internal/metrics
 *       static_configs:
 *         - targets: ['geotrack-app:3000']
 */
@Controller('internal')
export class MetricsController {
  @Get('metrics')
  @Public()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
