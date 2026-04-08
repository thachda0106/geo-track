import { envSchema, validateEnv } from './env.validation';

// ═══════════════════════════════════════════════════════
// Env Validation Tests
// ═══════════════════════════════════════════════════════

describe('envSchema', () => {
  const validEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    API_PREFIX: 'api/v1',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    KAFKA_BROKERS: 'localhost:9092',
    JWT_SECRET: 'dev-secret-change-in-production-minimum-32-chars!!',
    JWT_ACCESS_EXPIRATION: '15m',
    JWT_REFRESH_EXPIRATION: '7d',
    CORS_ORIGINS: 'http://localhost:5173',
    LOG_LEVEL: 'info',
    LOG_PRETTY: 'false',
    TRACKING_MAX_BATCH_SIZE: '100',
    TRACKING_MAX_SPEED_KMH: '200',
    TRACKING_ACCURACY_THRESHOLD_M: '50',
  };

  it('should parse valid environment variables', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.REDIS_PORT).toBe(6379);
    }
  });

  it('should apply defaults for optional fields', () => {
    const minimalEnv = {
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'dev-secret-change-in-production-minimum-32-chars!!',
    };
    const result = envSchema.safeParse(minimalEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3000);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.REDIS_HOST).toBe('localhost');
      expect(result.data.LOG_LEVEL).toBe('info');
    }
  });

  it('should fail when DATABASE_URL is missing', () => {
    const env = { ...validEnv };
    delete (env as any).DATABASE_URL;
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should fail when JWT_SECRET is too short', () => {
    const env = { ...validEnv, JWT_SECRET: 'short' };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should fail when NODE_ENV has invalid value', () => {
    const env = { ...validEnv, NODE_ENV: 'invalid' };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should fail when LOG_LEVEL has invalid value', () => {
    const env = { ...validEnv, LOG_LEVEL: 'verbose' };
    const result = envSchema.safeParse(env);
    expect(result.success).toBe(false);
  });

  it('should coerce PORT from string to number', () => {
    const result = envSchema.safeParse(validEnv);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(typeof result.data.PORT).toBe('number');
    }
  });

  it('should transform LOG_PRETTY to boolean', () => {
    const envTrue = { ...validEnv, LOG_PRETTY: 'true' };
    const envFalse = { ...validEnv, LOG_PRETTY: 'false' };

    const resultTrue = envSchema.safeParse(envTrue);
    const resultFalse = envSchema.safeParse(envFalse);

    expect(resultTrue.success && resultTrue.data.LOG_PRETTY).toBe(true);
    expect(resultFalse.success && resultFalse.data.LOG_PRETTY).toBe(false);
  });
});

describe('validateEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'dev-secret-change-in-production-minimum-32-chars!!',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return parsed config when env is valid', () => {
    const config = validateEnv();
    expect(config.PORT).toBe(3000);
    // Jest sets NODE_ENV=test, so validateEnv reads that from process.env
    expect(['development', 'test']).toContain(config.NODE_ENV);
  });

  it('should throw descriptive error when env is invalid', () => {
    process.env = { ...originalEnv }; // No DATABASE_URL
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;

    expect(() => validateEnv()).toThrow('Environment validation failed');
  });
});
