import { User } from '../../domain/entities/user.entity';

export interface AuthResponseTokenPayload {
  accessToken: string;
  expiresIn: string;
}

export interface ITokenService {
  /**
   * Generate a signed JWT access token for the user.
   */
  generateAccessToken(user: User): AuthResponseTokenPayload;

  /**
   * Generate a cryptographically secure random refresh token.
   */
  generateRefreshToken(): string;

  /**
   * Hash a token using SHA-256 for safe database storage.
   */
  hashToken(token: string): string;
}

export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
