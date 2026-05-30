import { Body, Controller, Get, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AdminReservationQueryDto } from './dto/admin-reservation-query.dto';
import { UpdateReservationStatusAdminDto } from '../reservation/dto/update-reservation-status-admin.dto';

@ApiTags('admin-reservations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/reservations')
export class AdminReservationController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiOperation({ summary: '예약 목록 (필터)' })
  list(@Query() query: AdminReservationQueryDto) {
    return this.admin.listReservations(query);
  }

  @Get(':reservationId')
  @ApiOperation({ summary: '예약 상세 (관리자)' })
  one(@Param('reservationId', ParseIntPipe) reservationId: number) {
    return this.admin.getReservation(reservationId);
  }

  @Put(':reservationId/status')
  @ApiOperation({ summary: '예약 상태 변경' })
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @Body() dto: UpdateReservationStatusAdminDto,
  ) {
    return this.admin.updateReservationStatus(user.id, reservationId, dto);
  }
}
