import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IPasswordService } from '../../application/security/password.service';

@Injectable()
export class BcryptPasswordService implements IPasswordService {
  private readonly BCRYPT_ROUNDS = 12;

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.BCRYPT_ROUNDS);
  }

  async comparePassword(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }

  async hashDummy(): Promise<void> {
    await bcrypt.hash('dummy', this.BCRYPT_ROUNDS);
  }
}
