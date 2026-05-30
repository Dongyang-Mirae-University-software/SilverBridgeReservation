import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '@prisma/client';

export class AdminUserQueryDto {
  @ApiPropertyOptional({ example: '홍길동', description: '이메일/이름/전화 검색어' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
