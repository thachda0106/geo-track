import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import {
  IRefreshTokenRepository,
  RefreshTokenRecord,
  CreateRefreshTokenData,
} from '../../domain/repositories/refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository implements IRefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateRefreshTokenData): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId: data.userId,
        tokenHash: data.tokenHash,
        familyId: data.familyId,
        expiresAt: data.expiresAt,
      },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!record) return null;

    return {
      id: record.id,
      userId: record.userId,
      tokenHash: record.tokenHash,
      familyId: record.familyId,
      expiresAt: record.expiresAt,
      isRevoked: record.isRevoked,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt,
    };
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async revokeByFamilyId(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
    });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            isRevoked: true,
            revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Keep revoked for 7 days for audit
          },
        ],
      },
    });
    return result.count;
  }
}
