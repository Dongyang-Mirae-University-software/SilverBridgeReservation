import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { UpdateHospitalStatusDto } from './dto/update-hospital-status.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';

@ApiTags('admin-hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/hospitals')
export class AdminHospitalController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiOperation({ summary: '병원 목록 (관리자)' })
  list() {
    return this.admin.listHospitals();
  }

  @Post()
  @ApiOperation({ summary: '병원 등록' })
  create(@Body() dto: CreateHospitalDto) {
    return this.admin.createHospital(dto);
  }

  @Put(':hospitalId')
  @ApiOperation({ summary: '병원 수정' })
  update(@Param('hospitalId', ParseIntPipe) hospitalId: number, @Body() dto: UpdateHospitalDto) {
    return this.admin.updateHospital(hospitalId, dto);
  }

  @Delete(':hospitalId')
  @ApiOperation({ summary: '병원 삭제 (soft)' })
  remove(@Param('hospitalId', ParseIntPipe) hospitalId: number) {
    return this.admin.softDeleteHospital(hospitalId);
  }

  @Put(':hospitalId/status')
  @ApiOperation({ summary: '병원 운영/혼잡 상태 수정' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @Body() dto: UpdateHospitalStatusDto,
  ) {
    return this.admin.updateHospitalStatus(user.id, hospitalId, dto);
  }

  @Post(':hospitalId/departments')
  @ApiOperation({ summary: '진료과 추가' })
  addDept(
    @Param('hospitalId', ParseIntPipe) hospitalId: number,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.admin.addDepartment(hospitalId, dto.name);
  }
}
