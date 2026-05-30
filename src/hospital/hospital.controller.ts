import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HospitalQueryDto } from './dto/hospital-query.dto';
import { AvailableSlotsQueryDto } from './dto/available-slots-query.dto';
import { HospitalService } from './hospital.service';

@ApiTags('hospitals')
@Controller('hospitals')
export class HospitalController {
  constructor(private readonly hospital: HospitalService) {}

  @Get()
  @ApiOperation({ summary: '병원 목록 (필터)' })
  list(@Query() query: HospitalQueryDto) {
    return this.hospital.list(query);
  }

  @Get(':hospitalId')
  @ApiOperation({ summary: '병원 상세' })
  detail(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.hospital.getById(hospitalId);
  }

  @Get(':hospitalId/status')
  @ApiOperation({ summary: '병원 운영/혼잡 상황' })
  status(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.hospital.getStatus(hospitalId);
  }

  @Get(':hospitalId/available-slots')
  @ApiOperation({ summary: '예약 가능 시간대' })
  slots(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @Query() q: AvailableSlotsQueryDto,
  ) {
    return this.hospital.getAvailableSlots(hospitalId, q.date);
  }

  @Get(':hospitalId/departments')
  @ApiOperation({ summary: '병원 진료과 목록' })
  departments(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.hospital.getDepartments(hospitalId);
  }
}
