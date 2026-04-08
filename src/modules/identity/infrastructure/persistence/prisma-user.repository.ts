import { Injectable } from '@nestjs/common';
import { PrismaService } from '@app/core';
import { User } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!data) return null;

    return User.reconstruct({
      id: data.id,
      email: data.email,
      passwordHash: data.passwordHash,
      displayName: data.displayName,
      role: data.role,
      status: data.status,
      lastLoginAt: data.lastLoginAt,
      createdAt: data.createdAt,
    });
  }

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!data) return null;

    return User.reconstruct({
      id: data.id,
      email: data.email,
      passwordHash: data.passwordHash,
      displayName: data.displayName,
      role: data.role,
      status: data.status,
      lastLoginAt: data.lastLoginAt,
      createdAt: data.createdAt,
    });
  }

  async save(user: User): Promise<User> {
    const isNew = !user.id;

    if (isNew) {
      const created = await this.prisma.user.create({
        data: {
          email: user.email,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          lastLoginAt: user.lastLoginAt,
        },
      });

      return User.reconstruct({
        id: created.id,
        email: created.email,
        passwordHash: created.passwordHash,
        displayName: created.displayName,
        role: created.role,
        status: created.status,
        lastLoginAt: created.lastLoginAt,
        createdAt: created.createdAt,
      });
    } else {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: user.email,
          passwordHash: user.passwordHash,
          displayName: user.displayName,
          role: user.role,
          status: user.status,
          lastLoginAt: user.lastLoginAt,
        },
      });

      return User.reconstruct({
        id: updated.id,
        email: updated.email,
        passwordHash: updated.passwordHash,
        displayName: updated.displayName,
        role: updated.role,
        status: updated.status,
        lastLoginAt: updated.lastLoginAt,
        createdAt: updated.createdAt,
      });
    }
  }
}
