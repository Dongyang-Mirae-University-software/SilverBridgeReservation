import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches, MinLength } from 'class-validator';

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
}
