import { z } from 'zod';

/**
 * Environment variable validation using Zod.
 * Fail fast on startup if required config is missing.
 */
export const envSchema = z.object({
  // App
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  API_PREFIX: z.string().default('api/v1'),

  // Database
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),

  // Kafka
  KAFKA_BROKERS: z.string().default('localhost:9092'),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRATION: z.string().default('15m'),
  JWT_REFRESH_EXPIRATION: z.string().default('7d'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:5173'),

  // Logging & Observability
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  LOG_PRETTY: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SENTRY_DSN: z.string().url().optional(),

  // Tracking
  TRACKING_MAX_BATCH_SIZE: z.coerce.number().default(100),
  TRACKING_MAX_SPEED_KMH: z.coerce.number().default(200),
  TRACKING_ACCURACY_THRESHOLD_M: z.coerce.number().default(50),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables at startup.
 * Throws with detailed error message if validation fails.
 */
export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');

    throw new Error(
      `\n❌ Environment validation failed:\n${errors}\n\nCheck .env.example for required variables.\n`,
    );
  }

  return result.data;
}
