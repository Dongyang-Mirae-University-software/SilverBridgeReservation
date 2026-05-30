import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'secret1234' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '010-1234-5678' })
  @Matches(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, { message: '연락처 형식이 올바르지 않습니다.' })
  phone!: string;
}
