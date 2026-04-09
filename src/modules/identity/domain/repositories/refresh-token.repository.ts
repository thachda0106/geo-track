export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  isRevoked: boolean;
  createdAt: Date;
  revokedAt: Date | null;
}

export interface CreateRefreshTokenData {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface IRefreshTokenRepository {
  /**
   * Persist a new refresh token record.
   */
  create(data: CreateRefreshTokenData): Promise<void>;

  /**
   * Find a refresh token by its hash.
   */
  findByTokenHash(tokenHash: string): Promise<RefreshTokenRecord | null>;

  /**
   * Revoke a single token by its hash.
   */
  revokeByTokenHash(tokenHash: string): Promise<void>;

  /**
   * Revoke ALL tokens in a family (cascade invalidation on theft detection).
   */
  revokeByFamilyId(familyId: string): Promise<void>;

  /**
   * Delete expired tokens. Returns the number of deleted records.
   */
  purgeExpired(): Promise<number>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
