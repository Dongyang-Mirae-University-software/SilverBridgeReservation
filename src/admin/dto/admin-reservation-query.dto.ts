import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminReservationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  hospitalId?: number;

  @ApiPropertyOptional({ example: '2026-04-11' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({ enum: ReservationStatus })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}
