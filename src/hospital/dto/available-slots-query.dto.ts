import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AvailableSlotsQueryDto {
  @ApiProperty({ example: '2026-04-11' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    example: '내과',
    description: '진료과. 시간 칸은 진료과마다 따로다. 생략하면 병원 전체 예약 기준(예전 동작).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  department?: string;
}
