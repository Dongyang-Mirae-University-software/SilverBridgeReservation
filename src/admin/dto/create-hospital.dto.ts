import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateHospitalDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  region!: string;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '09:00' })
  @Matches(/^\d{2}:\d{2}$/)
  openTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(/^\d{2}:\d{2}$/)
  closeTime!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  bookingAvailable?: boolean;

  @ApiProperty({ type: [String], example: ['안과', '내과'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  departments!: string[];

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
