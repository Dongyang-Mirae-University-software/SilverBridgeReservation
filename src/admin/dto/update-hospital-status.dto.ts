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

  // todayReservationCount 는 받지 않는다 - 오늘(KST) 예약 행을 세서 응답한다(보내면 forbidNonWhitelisted 로 400).

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  acceptingPatients?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notice?: string;
}
