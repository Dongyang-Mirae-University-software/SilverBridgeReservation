import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { OperationStatus } from '@prisma/client';

export class HospitalQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: '진료과명 부분 일치' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ enum: OperationStatus })
  @IsOptional()
  @IsEnum(OperationStatus)
  operationStatus?: OperationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  bookingAvailable?: boolean;
}
