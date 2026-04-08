import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { AuthenticatedUser } from './jwt.strategy';
import { ForbiddenError } from '../errors/domain-errors';

/**
 * RBAC Guard.
 * Checks if the authenticated user's role is in the allowed roles list.
 * Use with @Roles('editor', 'admin') decorator on controller methods.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @Roles() decorator = any authenticated user can access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenError(
        `Role '${user.role}' does not have access. Required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
