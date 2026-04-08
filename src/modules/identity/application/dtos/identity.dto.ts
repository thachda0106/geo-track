import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: 'StrongP@ssw0rd',
    description: 'User password',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;

  @ApiProperty({ example: 'John Doe', description: 'User display name' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName!: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd', description: 'User password' })
  @IsString()
  password!: string;
}

export class UserProfileDto {
  @ApiProperty({ example: '00000000-0000-0000-0000-000000000000' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  displayName!: string;

  @ApiProperty({ example: 'viewer', enum: ['viewer', 'editor', 'admin'] })
  role!: string;
}

export class AuthResponse {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: '15m' })
  expiresIn!: string;

  @ApiProperty({ type: UserProfileDto })
  user!: UserProfileDto;
}
