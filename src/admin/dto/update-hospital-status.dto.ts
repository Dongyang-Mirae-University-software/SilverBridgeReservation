import { ApiPropertyOptional } from '@nestjs/swagger';
import { CongestionLevel, OperationStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateHospitalStatusDto {
  @ApiPropertyOptional({ enum: OperationStatus })
  @IsOptional()
  @IsEnum(OperationStatus)
  operationStatus?: OperationStatus;

  @ApiPropertyOptional({ enum: CongestionLevel })
  @IsOptional()
  @IsEnum(CongestionLevel)
  congestionLevel?: CongestionLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  waitingCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  averageWaitingMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  todayReservationCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptingPatients?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notice?: string;
}
