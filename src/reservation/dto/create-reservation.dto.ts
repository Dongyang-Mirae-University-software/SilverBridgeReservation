import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty()
  @IsInt()
  hospitalId!: number;

  @ApiProperty({ example: '안과' })
  @IsString()
  @MinLength(1)
  department!: string;

  @ApiProperty({ example: '2026-04-11' })
  @IsDateString()
  reservationDate!: string;

  @ApiProperty({ example: '15:00' })
  @Matches(/^\d{2}:\d{2}$/, { message: '예약 시간은 HH:mm 형식이어야 합니다.' })
  reservationTime!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  patientName!: string;

  @ApiProperty({ example: '010-1234-5678' })
  @Matches(/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, { message: '연락처 형식이 올바르지 않습니다.' })
  phone!: string;

  @ApiPropertyOptional({ example: '1998-05-10' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  symptomSummary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  guardianName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^$|^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/, {
    message: '보호자 연락처 형식이 올바르지 않습니다.',
  })
  guardianPhone?: string;

  @ApiPropertyOptional({ description: '응급 확장용' })
  @IsOptional()
  @IsString()
  urgencyLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  symptomSeverity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emergencyFlag?: boolean;
}
