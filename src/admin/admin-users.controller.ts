import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  @ApiOperation({ summary: '회원 목록 (관리자)' })
  list(@Query() query: AdminUserQueryDto) {
    return this.admin.listUsers(query);
  }

  @Get(':userId')
  @ApiOperation({ summary: '회원 상세 (관리자)' })
  one(@Param('userId', ParseIntPipe) userId: number) {
    return this.admin.getUser(userId);
  }

  @Post()
  @ApiOperation({ summary: '회원 등록 (관리자)' })
  create(@CurrentUser() admin: AuthUser, @Body() dto: CreateUserDto) {
    return this.admin.createUser(admin.id, dto);
  }

  @Put(':userId')
  @ApiOperation({ summary: '회원 수정 (관리자)' })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.admin.updateUser(admin.id, userId, dto);
  }
}
