import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { User } from '../../domain/entities/user.entity';
import {
  ITokenService,
  AuthResponseTokenPayload,
} from '../../application/security/token.service';

@Injectable()
export class NestJwtTokenService implements ITokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateAccessToken(user: User): AuthResponseTokenPayload {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      expiresIn:
        this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m',
    };
  }

  /**
   * Generate a cryptographically secure 256-bit random token,
   * returned as a URL-safe Base64 string.
   */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Hash a token using SHA-256 for safe database storage.
   * We never store raw tokens — only their hashes.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
