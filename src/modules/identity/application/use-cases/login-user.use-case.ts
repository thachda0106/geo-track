import { Injectable, Inject } from '@nestjs/common';
import { LoginDto, AuthResponse } from '../dtos/identity.dto';
import {
  IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository';
import {
  IPasswordService,
  PASSWORD_SERVICE,
} from '../security/password.service';
import { ITokenService, TOKEN_SERVICE } from '../security/token.service';
import { ForbiddenError } from '@app/core';

@Injectable()
export class LoginUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    @Inject(PASSWORD_SERVICE)
    private readonly passwordService: IPasswordService,
    @Inject(TOKEN_SERVICE) private readonly tokenService: ITokenService,
  ) {}

  async execute(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepository.findByEmail(dto.email);

    if (!user) {
      // Timing-safe: still hash to prevent timing attacks
      await this.passwordService.hashDummy();
      throw new ForbiddenError('Invalid credentials');
    }

    if (user.isSuspended()) {
      throw new ForbiddenError('Account is suspended');
    }

    const isPasswordValid = await this.passwordService.comparePassword(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new ForbiddenError('Invalid credentials');
    }

    user.recordLogin();
    await this.userRepository.save(user);

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
