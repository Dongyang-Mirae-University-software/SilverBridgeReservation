import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Matches, Max, Min } from 'class-validator';

/** 그 요일만 기본 진료 시간을 덮어쓴다(예: 토요일 09:00~13:00 반일). */
export class WeekdayHoursDto {
  @ApiProperty({ example: 6, description: '요일(0=일 … 6=토)' })
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  openTime!: string;

  @ApiProperty({ example: '13:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closeTime!: string;
}
