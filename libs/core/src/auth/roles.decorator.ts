import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './jwt.strategy';

// ═══════════════════════════════════════════════════════
// @Public() — Skip JWT authentication for a route
// ═══════════════════════════════════════════════════════
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ═══════════════════════════════════════════════════════
// @Roles('editor', 'admin') — Require specific roles
// ═══════════════════════════════════════════════════════
export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

// ═══════════════════════════════════════════════════════
// @CurrentUser() — Extract authenticated user from request
// ═══════════════════════════════════════════════════════
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    return data ? user?.[data] : user;
  },
);
