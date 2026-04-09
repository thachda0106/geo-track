import { Injectable, Inject } from '@nestjs/common';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository';
import { ITokenService, TOKEN_SERVICE } from '../security/token.service';
import { UnauthorizedError } from '@app/core';

/**
 * Revoke all refresh tokens in a family.
 * Called when user logs out — invalidates the current session entirely.
 */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  async execute(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const storedToken = await this.refreshTokenRepo.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Revoke the entire token family — all active sessions in this chain
    await this.refreshTokenRepo.revokeByFamilyId(storedToken.familyId);
  }
}
