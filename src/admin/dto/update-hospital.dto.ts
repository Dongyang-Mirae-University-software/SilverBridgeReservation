import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class UpdateHospitalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  openTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  closeTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  bookingAvailable?: boolean;

  @ApiPropertyOptional({ example: '12:30', nullable: true, description: '점심시간 시작(HH:mm). 끝과 함께, null 이면 점심시간 없음' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakStart?: string | null;

  @ApiPropertyOptional({ example: '13:30', nullable: true, description: '점심시간 끝(HH:mm)' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  breakEnd?: string | null;

  @ApiPropertyOptional({ type: [Number], example: [0], description: '휴진 요일(0=일 … 6=토), 빈 배열이면 없음' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  closedWeekdays?: number[];
}
