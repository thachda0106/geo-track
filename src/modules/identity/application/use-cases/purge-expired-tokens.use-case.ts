import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository';

/**
 * Scheduled job that purges expired and old revoked refresh tokens.
 * Runs every hour to keep the refresh_tokens table lean.
 */
@Injectable()
export class PurgeExpiredTokensUseCase {
  private readonly logger = new Logger(PurgeExpiredTokensUseCase.name);

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async execute(): Promise<void> {
    const deletedCount = await this.refreshTokenRepo.purgeExpired();

    if (deletedCount > 0) {
      this.logger.log(`Purged ${deletedCount} expired/revoked refresh tokens`);
    }
  }
}
