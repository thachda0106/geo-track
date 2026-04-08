export interface IPasswordService {
  hashPassword(password: string): Promise<string>;
  comparePassword(plainText: string, hash: string): Promise<boolean>;
  hashDummy(): Promise<void>; // To protect against timing attacks when user is not found
}

export const PASSWORD_SERVICE = Symbol('PASSWORD_SERVICE');
