import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  applyDecorators,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';

export const API_KEY_REQUIRED = 'apiKeyRequired';

/**
 * Guard that validates X-API-Key header against INGEST_API_KEY env variable.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * Usage: Apply @UseApiKey() decorator on routes that need API key auth
 * instead of JWT (e.g., IoT ingest endpoints).
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requireApiKey = this.reflector.getAllAndOverride<boolean>(
      API_KEY_REQUIRED,
      [context.getHandler(), context.getClass()],
    );

    if (!requireApiKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
    }>();
    const apiKey = request.headers['x-api-key'];
    const validKey = this.configService.get<string>('INGEST_API_KEY');

    if (!apiKey || !validKey) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    // Constant-time comparison to prevent timing attacks
    const apiKeyBuffer = Buffer.from(apiKey);
    const validKeyBuffer = Buffer.from(validKey);

    if (
      apiKeyBuffer.length !== validKeyBuffer.length ||
      !timingSafeEqual(apiKeyBuffer, validKeyBuffer)
    ) {
      throw new UnauthorizedException('Missing or invalid API key');
    }

    return true;
  }
}

/**
 * Decorator that requires a valid X-API-Key header.
 * Combine with @Public() for routes that bypass JWT but need API key auth.
 *
 * @example
 * ```ts
 * @Public()     // Bypass JWT
 * @UseApiKey()  // Require API key instead
 * @Post('ingest')
 * async ingest() { ... }
 * ```
 */
export function UseApiKey() {
  return applyDecorators(
    SetMetadata(API_KEY_REQUIRED, true),
    UseGuards(ApiKeyGuard),
  );
}
