import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
}
