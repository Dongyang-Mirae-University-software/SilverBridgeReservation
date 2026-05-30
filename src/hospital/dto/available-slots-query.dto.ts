import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class AvailableSlotsQueryDto {
  @ApiProperty({ example: '2026-04-11' })
  @IsDateString()
  date!: string;
}
