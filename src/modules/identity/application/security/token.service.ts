import { User } from '../../domain/entities/user.entity';

export interface AuthResponseTokenPayload {
  accessToken: string;
  expiresIn: string;
}

export interface ITokenService {
  generateAccessToken(user: User): AuthResponseTokenPayload;
}

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
