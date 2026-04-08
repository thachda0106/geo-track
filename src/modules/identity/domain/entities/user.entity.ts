export interface UserProps {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get passwordHash(): string {
    return this.props.passwordHash;
  }
  get displayName(): string {
    return this.props.displayName;
  }
  get role(): string {
    return this.props.role;
  }
  get status(): string {
    return this.props.status;
  }
  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isActive(): boolean {
    return this.props.status === 'active';
  }

  isSuspended(): boolean {
    return this.props.status !== 'active';
  }

  recordLogin(): void {
    if (!this.isActive()) {
      throw new Error('Cannot login suspended account.');
    }
    this.props.lastLoginAt = new Date();
  }

  static reconstruct(props: UserProps): User {
    return new User(props);
  }

  static create(
    props: Omit<UserProps, 'id' | 'createdAt' | 'lastLoginAt'>,
  ): User {
    return new User({
      ...props,
      id: '', // DB assigned logically via prisma, or UI uuid.
      lastLoginAt: null,
      createdAt: new Date(),
    });
  }
}
