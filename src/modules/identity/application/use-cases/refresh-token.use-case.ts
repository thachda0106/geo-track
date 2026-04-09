import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository';
import { ITokenService, TOKEN_SERVICE } from '../security/token.service';
import { UnauthorizedError } from '@app/core';
import { v4 as uuidv4 } from 'uuid';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

/**
 * Implements refresh token rotation with token family tracking.
 *
 * Security model:
 * - Each login creates a new "family" of tokens
 * - Each refresh rotates the token (old revoked, new created in same family)
 * - If a revoked token is reused → entire family is invalidated (theft detection)
 */
@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
    private readonly configService: ConfigService,
  ) {}

  async execute(rawRefreshToken: string): Promise<RefreshResult> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepo.findByTokenHash(tokenHash);

    // Token not found
    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // ┌─────────────────────────────────────────────────────────┐
    // │ THEFT DETECTION: If a revoked token is reused, it means │
    // │ the token was stolen. Revoke the entire family           │
    // │ to protect the user.                                     │
    // └─────────────────────────────────────────────────────────┘
    if (storedToken.isRevoked) {
      this.logger.warn(
        `Refresh token reuse detected! Revoking family ${storedToken.familyId} for user ${storedToken.userId}`,
      );
      await this.refreshTokenRepo.revokeByFamilyId(storedToken.familyId);
      throw new UnauthorizedError(
        'Refresh token has been revoked. Please login again.',
      );
    }

    // Token expired
    if (storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired');
    }

    // Verify user still exists and is active
    const user = await this.userRepository.findById(storedToken.userId);
    if (!user || user.isSuspended()) {
      await this.refreshTokenRepo.revokeByFamilyId(storedToken.familyId);
      throw new UnauthorizedError('Account not found or suspended');
    }

    // ┌─────────────────────────────────────────────────────────┐
    // │ ROTATION: Revoke old token, issue new one in same family │
    // └─────────────────────────────────────────────────────────┘
    await this.refreshTokenRepo.revokeByTokenHash(tokenHash);

    // Generate new tokens
    const accessTokenPayload = this.tokenService.generateAccessToken(user);
    const newRawRefreshToken = this.tokenService.generateRefreshToken();
    const newTokenHash = this.tokenService.hashToken(newRawRefreshToken);

    const refreshExpiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );
    const expiresAt = this.calculateExpiration(refreshExpiration);

    await this.refreshTokenRepo.create({
      userId: user.id,
      tokenHash: newTokenHash,
      familyId: storedToken.familyId, // Same family — token rotation
      expiresAt,
    });

    return {
      accessToken: accessTokenPayload.accessToken,
      refreshToken: newRawRefreshToken,
      expiresIn: accessTokenPayload.expiresIn,
    };
  }

  /**
   * Issue a new refresh token for a login (creates a new family).
   */
  async issueForLogin(userId: string): Promise<string> {
    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const familyId = uuidv4();

    const refreshExpiration = this.configService.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '7d',
    );
    const expiresAt = this.calculateExpiration(refreshExpiration);

    await this.refreshTokenRepo.create({
      userId,
      tokenHash,
      familyId,
      expiresAt,
    });

    return rawRefreshToken;
  }

  private calculateExpiration(duration: string): Date {
    const now = Date.now();
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return new Date(now + 7 * 24 * 60 * 60 * 1000); // Default 7d

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(now + value * (multipliers[unit] || multipliers['d']));
  }
}
