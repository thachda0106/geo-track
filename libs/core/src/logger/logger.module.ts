import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppLoggerService } from './logger.service';

/**
 * Global Logger Module — powered by nestjs-pino + pino-http.
 *
 * What it does automatically (zero effort for developers):
 * 1. Generates a unique `reqId` per HTTP request (from X-Request-Id header or UUID)
 * 2. Stores that ID in AsyncLocalStorage — ANY logger.info() call
 *    anywhere in the call chain will include it automatically
 * 3. Auto-logs every HTTP request entry and exit with:
 *    method, url, statusCode, responseTime (ms)
 * 4. Redacts sensitive fields (authorization, password, token)
 *
 * In dev: pretty-printed colored logs
 * In prod: raw JSON for Loki/ELK ingestion
 */
@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isPretty = config.get<string>('LOG_PRETTY') === 'true';
        const level = config.get<string>('LOG_LEVEL') || 'info';

        return {
          pinoHttp: {
            level,

            // ─── Correlation ID: link X-Request-Id header to every log ───
            genReqId: (req: { headers: Record<string, string | string[] | undefined> }) => {
              return (req.headers['x-request-id'] as string) || crypto.randomUUID();
            },

            // ─── Inject correlationId into every log line ───
            // genReqId stores ID as req.id; customProps surfaces it as "correlationId"
            // so it's always visible in both pretty and JSON output
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            customProps: (req: any) => ({
              correlationId: String(req.id ?? ''),
            }),

            // ─── Redact sensitive data from logs ───
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.token',
                'req.body.refreshToken',
              ],
              censor: '[REDACTED]',
            },

            // ─── Custom serializers — trim fat from request/response logs ───
            serializers: {
              req: (req: Record<string, unknown>) => ({
                method: req.method,
                url: req.url,
                // Don't log full headers in production (too noisy)
              }),
              res: (res: Record<string, unknown>) => ({
                statusCode: res.statusCode,
              }),
            },

            // ─── Custom log message format ───
            customLogLevel: (_req: unknown, res: { statusCode: number }, err?: Error) => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },

            // ─── Pretty print in development ───
            ...(isPretty
              ? {
                  transport: {
                    target: 'pino-pretty',
                    options: {
                      colorize: true,
                      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l',
                      ignore: 'pid,hostname',
                      singleLine: false,
                    },
                  },
                }
              : {
                  // Production: structured JSON, no transport overhead
                  formatters: {
                    level: (label: string) => ({ level: label }),
                  },
                  timestamp: () => `,"time":"${new Date().toISOString()}"`,
                }),
          },
        };
      },
    }),
  ],
  providers: [AppLoggerService],
  exports: [AppLoggerService, PinoLoggerModule],
})
export class LoggerModule {}
