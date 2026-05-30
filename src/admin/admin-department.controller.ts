import { Body, Controller, Delete, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminService } from './admin.service';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@ApiTags('admin-departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/departments')
export class AdminDepartmentController {
  constructor(private readonly admin: AdminService) {}

  @Put(':departmentId')
  @ApiOperation({ summary: '진료과 수정' })
  update(@Param('departmentId', ParseIntPipe) departmentId: number, @Body() dto: UpdateDepartmentDto) {
    return this.admin.updateDepartment(departmentId, { name: dto.name, active: dto.active });
  }

  @Delete(':departmentId')
  @ApiOperation({ summary: '진료과 비활성(삭제)' })
  remove(@Param('departmentId', ParseIntPipe) departmentId: number) {
    return this.admin.deleteDepartment(departmentId);
  }
}
