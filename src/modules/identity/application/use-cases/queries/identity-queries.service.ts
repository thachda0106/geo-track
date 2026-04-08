import { Injectable } from '@nestjs/common';
import { PrismaService, NotFoundError } from '@app/core';

@Injectable()
export class IdentityQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User', userId);
    }

    return user;
  }
}
