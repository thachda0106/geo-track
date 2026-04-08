import { HttpStatus } from '@nestjs/common';

// ═══════════════════════════════════════════════════════
// Base Domain Error
// All domain errors extend this. Never throw raw Error.
// ═══════════════════════════════════════════════════════

export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

// ═══════════════════════════════════════════════════════
// Concrete Domain Errors
// ═══════════════════════════════════════════════════════

/** 400 — Input validation failed */
export class ValidationError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly errorCode = 'VALIDATION_ERROR';
  readonly errors: Array<{ field: string; code: string; message: string }>;

  constructor(errors: Array<{ field: string; code: string; message: string }>) {
    super('Validation failed');
    this.errors = errors;
  }
}

/** 400 — Invalid GeoJSON geometry */
export class InvalidGeometryError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly errorCode = 'INVALID_GEOMETRY';

  constructor(reason: string) {
    super(`Invalid geometry: ${reason}`);
  }
}

/** 404 — Resource not found */
export class NotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly errorCode = 'NOT_FOUND';

  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, { resource, id });
  }
}

/** 409 — Optimistic locking conflict */
export class ConflictError extends DomainError {
  readonly statusCode = HttpStatus.CONFLICT;
  readonly errorCode = 'VERSION_CONFLICT';

  constructor(
    resource: string,
    currentVersion: number,
    expectedVersion: number,
  ) {
    super(
      `${resource} version conflict: current=${currentVersion}, expected=${expectedVersion}`,
      { currentVersion, expectedVersion },
    );
  }
}

/** 409 — Duplicate resource */
export class DuplicateError extends DomainError {
  readonly statusCode = HttpStatus.CONFLICT;
  readonly errorCode = 'DUPLICATE';

  constructor(resource: string, field: string, value: string) {
    super(`${resource} with ${field}="${value}" already exists`, {
      resource,
      field,
    });
  }
}

/** 403 — Insufficient permissions */
export class ForbiddenError extends DomainError {
  readonly statusCode = HttpStatus.FORBIDDEN;
  readonly errorCode = 'FORBIDDEN';

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}

/** 429 — Rate limit exceeded */
export class RateLimitError extends DomainError {
  readonly statusCode = HttpStatus.TOO_MANY_REQUESTS;
  readonly errorCode = 'RATE_LIMIT_EXCEEDED';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limit exceeded. Retry after ${retryAfterSeconds}s`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 422 — Business rule violation */
export class BusinessRuleError extends DomainError {
  readonly statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
  readonly errorCode = 'BUSINESS_RULE_VIOLATION';

  constructor(rule: string) {
    super(`Business rule violated: ${rule}`);
  }
}

// ═══════════════════════════════════════════════════════
// RFC 7807 Problem Details response shape
// ═══════════════════════════════════════════════════════

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; code: string; message: string }>;
}

/**
 * Convert a DomainError to RFC 7807 Problem Details.
 */
export function toProblemDetails(
  error: DomainError,
  instance?: string,
  correlationId?: string,
): ProblemDetails {
  const problem: ProblemDetails = {
    type: `https://api.geotrack.app/errors/${error.errorCode.toLowerCase().replace(/_/g, '-')}`,
    title: error.errorCode.replace(/_/g, ' '),
    status: error.statusCode,
    detail: error.message,
    instance,
    correlationId,
  };

  if (error instanceof ValidationError) {
    problem.errors = error.errors;
  }

  return problem;
}
