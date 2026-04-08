import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
}
