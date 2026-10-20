import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty({ example: '<ADMIN_PANEL_PASSWORD>', description: '관리자 패널 비밀번호 (환경변수 ADMIN_PANEL_PASSWORD와 일치)' })
  @IsString()
  @MinLength(4)
  password!: string;
}
