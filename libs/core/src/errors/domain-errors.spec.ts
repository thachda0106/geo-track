import {
  DomainError,
  ValidationError,
  InvalidGeometryError,
  NotFoundError,
  ConflictError,
  DuplicateError,
  ForbiddenError,
  RateLimitError,
  BusinessRuleError,
  toProblemDetails,
} from './domain-errors';
import { HttpStatus } from '@nestjs/common';

// ═══════════════════════════════════════════════════════
// Domain Error Hierarchy Tests
// ═══════════════════════════════════════════════════════

describe('DomainErrors', () => {
  describe('ValidationError', () => {
    it('should have 400 status and VALIDATION_ERROR code', () => {
      const errors = [
        {
          field: 'email',
          code: 'INVALID_FORMAT',
          message: 'Must be a valid email',
        },
      ];
      const error = new ValidationError(errors);

      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.errorCode).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual(errors);
      expect(error.message).toBe('Validation failed');
      expect(error).toBeInstanceOf(DomainError);
    });

    it('should support multiple validation errors', () => {
      const errors = [
        { field: 'email', code: 'REQUIRED', message: 'Email is required' },
        {
          field: 'password',
          code: 'MIN_LENGTH',
          message: 'Password must be at least 8 characters',
        },
      ];
      const error = new ValidationError(errors);
      expect(error.errors).toHaveLength(2);
    });
  });

  describe('InvalidGeometryError', () => {
    it('should have 400 status and describe the geometry issue', () => {
      const error = new InvalidGeometryError('Polygon ring is not closed');
      expect(error.statusCode).toBe(HttpStatus.BAD_REQUEST);
      expect(error.errorCode).toBe('INVALID_GEOMETRY');
      expect(error.message).toContain('Polygon ring is not closed');
    });
  });

  describe('NotFoundError', () => {
    it('should have 404 status with resource and id details', () => {
      const error = new NotFoundError('Feature', 'abc-123');
      expect(error.statusCode).toBe(HttpStatus.NOT_FOUND);
      expect(error.errorCode).toBe('NOT_FOUND');
      expect(error.message).toContain('Feature');
      expect(error.message).toContain('abc-123');
      expect(error.details).toEqual({ resource: 'Feature', id: 'abc-123' });
    });
  });

  describe('ConflictError', () => {
    it('should have 409 status with version info', () => {
      const error = new ConflictError('Feature', 5, 3);
      expect(error.statusCode).toBe(HttpStatus.CONFLICT);
      expect(error.errorCode).toBe('VERSION_CONFLICT');
      expect(error.details).toEqual({ currentVersion: 5, expectedVersion: 3 });
    });
  });

  describe('DuplicateError', () => {
    it('should have 409 status with duplicate info', () => {
      const error = new DuplicateError('User', 'email', 'test@example.com');
      expect(error.statusCode).toBe(HttpStatus.CONFLICT);
      expect(error.errorCode).toBe('DUPLICATE');
      expect(error.message).toContain('email');
      expect(error.message).toContain('test@example.com');
    });
  });

  describe('ForbiddenError', () => {
    it('should have 403 status with default message', () => {
      const error = new ForbiddenError();
      expect(error.statusCode).toBe(HttpStatus.FORBIDDEN);
      expect(error.errorCode).toBe('FORBIDDEN');
      expect(error.message).toBe('Insufficient permissions');
    });

    it('should support custom message', () => {
      const error = new ForbiddenError('Custom forbidden message');
      expect(error.message).toBe('Custom forbidden message');
    });
  });

  describe('RateLimitError', () => {
    it('should have 429 status with retry info', () => {
      const error = new RateLimitError(60);
      expect(error.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(error.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfterSeconds).toBe(60);
    });
  });

  describe('BusinessRuleError', () => {
    it('should have 422 status', () => {
      const error = new BusinessRuleError('Session is already ended');
      expect(error.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(error.errorCode).toBe('BUSINESS_RULE_VIOLATION');
      expect(error.message).toContain('Session is already ended');
    });
  });
});

// ═══════════════════════════════════════════════════════
// RFC 7807 Problem Details Tests
// ═══════════════════════════════════════════════════════

describe('toProblemDetails', () => {
  it('should convert NotFoundError to RFC 7807 format', () => {
    const error = new NotFoundError('Feature', 'abc-123');
    const problem = toProblemDetails(
      error,
      '/api/v1/features/abc-123',
      'req-456',
    );

    expect(problem).toEqual({
      type: 'https://api.geotrack.app/errors/not-found',
      title: 'NOT FOUND',
      status: 404,
      detail: expect.stringContaining('Feature not found'),
      instance: '/api/v1/features/abc-123',
      correlationId: 'req-456',
    });
  });

  it('should include validation errors array for ValidationError', () => {
    const errors = [
      { field: 'email', code: 'REQUIRED', message: 'Email is required' },
    ];
    const error = new ValidationError(errors);
    const problem = toProblemDetails(error);

    expect(problem.errors).toEqual(errors);
  });

  it('should generate correct error type URL from error code', () => {
    const error = new ConflictError('Feature', 1, 2);
    const problem = toProblemDetails(error);

    expect(problem.type).toBe(
      'https://api.geotrack.app/errors/version-conflict',
    );
  });

  it('should handle missing optional fields', () => {
    const error = new ForbiddenError();
    const problem = toProblemDetails(error);

    expect(problem.instance).toBeUndefined();
    expect(problem.correlationId).toBeUndefined();
  });
});
