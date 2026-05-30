import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationService } from './reservation.service';

@ApiTags('reservations')
@Controller('reservations')
export class ReservationController {
  constructor(private readonly reservation: ReservationService) {}

  @Post()
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: '예약 생성' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReservationDto) {
    return this.reservation.create(user.id, dto);
  }

  @Get('my')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: '내 예약 목록' })
  my(@CurrentUser() user: AuthUser) {
    return this.reservation.listMine(user.id);
  }

  @Get(':reservationId')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: '예약 상세' })
  one(@CurrentUser() user: AuthUser, @Param('reservationId', ParseIntPipe) reservationId: number) {
    return this.reservation.getOne(reservationId, user.id);
  }

  @Patch(':reservationId/cancel')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: '예약 취소' })
  cancel(@CurrentUser() user: AuthUser, @Param('reservationId', ParseIntPipe) reservationId: number) {
    return this.reservation.cancel(reservationId, user.id);
  }

  @Delete(':reservationId')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiBearerAuth()
  @ApiSecurity('api-key')
  @ApiOperation({ summary: '예약 삭제(취소)' })
  delete(@CurrentUser() user: AuthUser, @Param('reservationId', ParseIntPipe) reservationId: number) {
    return this.reservation.cancel(reservationId, user.id);
  }
}
