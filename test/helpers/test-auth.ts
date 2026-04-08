import { JwtService } from '@nestjs/jwt';
import { TEST_JWT_SECRET } from './test-setup.module';

// ═══════════════════════════════════════════════════════
// Test Auth Utilities
// ═══════════════════════════════════════════════════════

export type TestRole = 'viewer' | 'editor' | 'admin';

export interface TestUser {
  userId: string;
  email: string;
  role: TestRole;
}

/**
 * Pre-defined test users for common scenarios.
 */
export const TEST_USERS: Record<string, TestUser> = {
  viewer: {
    userId: '00000000-0000-4000-a000-000000000001',
    email: 'viewer@test.com',
    role: 'viewer',
  },
  editor: {
    userId: '00000000-0000-4000-a000-000000000002',
    email: 'editor@test.com',
    role: 'editor',
  },
  admin: {
    userId: '00000000-0000-4000-a000-000000000003',
    email: 'admin@test.com',
    role: 'admin',
  },
};

/**
 * Generate a valid JWT token for a test user.
 *
 * @example
 * const token = generateTestJwt('editor');
 * const token = generateTestJwt({ userId: 'custom-id', email: 'custom@test.com', role: 'admin' });
 */
export function generateTestJwt(userOrRole: TestRole | TestUser): string {
  const user = typeof userOrRole === 'string' ? TEST_USERS[userOrRole] : userOrRole;

  if (!user) {
    throw new Error(`Unknown test role: ${userOrRole}`);
  }

  const jwtService = new JwtService({
    secret: TEST_JWT_SECRET,
    signOptions: { expiresIn: '15m', algorithm: 'HS256' },
  });

  return jwtService.sign({
    sub: user.userId,
    email: user.email,
    role: user.role,
  });
}

/**
 * Generate an Authorization header value.
 *
 * @example
 * const headers = { Authorization: authHeader('editor') };
 */
export function authHeader(userOrRole: TestRole | TestUser): string {
  return `Bearer ${generateTestJwt(userOrRole)}`;
}

/**
 * Generate an expired JWT for testing auth rejection.
 */
export function generateExpiredJwt(role: TestRole = 'viewer'): string {
  const user = TEST_USERS[role];
  const jwtService = new JwtService({
    secret: TEST_JWT_SECRET,
    signOptions: { expiresIn: '0s', algorithm: 'HS256' },
  });

  return jwtService.sign({
    sub: user.userId,
    email: user.email,
    role: user.role,
  });
}
