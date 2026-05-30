import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: '홍길동' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '010-1234-5678' })
  @IsOptional()
  @Matches(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, { message: '연락처 형식이 올바르지 않습니다.' })
  phone?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'newpassword1234', description: '입력 시 비밀번호를 재설정합니다.' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
