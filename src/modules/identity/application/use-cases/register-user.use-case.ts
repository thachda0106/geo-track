import { Injectable, Inject } from '@nestjs/common';
import { RegisterDto, AuthResponse } from '../dtos/identity.dto';
import { User } from '../../domain/entities/user.entity';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository';
import {
  IPasswordService,
  PASSWORD_SERVICE,
} from '../security/password.service';
import { ITokenService, TOKEN_SERVICE } from '../security/token.service';
import { DuplicateError } from '@app/core';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_SERVICE)
    private readonly passwordService: IPasswordService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  async execute(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.userRepository.findByEmail(dto.email);

    if (existing) {
      throw new DuplicateError('User', 'email', dto.email);
    }

    const passwordHash = await this.passwordService.hashPassword(dto.password);

    const userToSave = User.create({
      email: dto.email,
      passwordHash,
      displayName: dto.displayName,
      role: 'viewer',
      status: 'active',
    });

    const user = await this.userRepository.save(userToSave);

    const tokenPayload = this.tokenService.generateAccessToken(user);

    return {
      accessToken: tokenPayload.accessToken,
      expiresIn: tokenPayload.expiresIn,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    };
  }
}
