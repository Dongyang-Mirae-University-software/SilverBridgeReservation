import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@ApiTags('api-keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'API 키 발급' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'API 키 목록 조회' })
  list(@CurrentUser() user: AuthUser) {
    return this.apiKeys.list(user.id);
  }

  @Post(':apiKeyId/reissue')
  @ApiOperation({ summary: 'API 키 재발급' })
  reissue(
    @CurrentUser() user: AuthUser,
    @Param('apiKeyId', ParseIntPipe) apiKeyId: number,
  ) {
    return this.apiKeys.reissue(user.id, apiKeyId);
  }

  @Delete(':apiKeyId')
  @ApiOperation({ summary: 'API 키 폐기' })
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('apiKeyId', ParseIntPipe) apiKeyId: number,
  ) {
    return this.apiKeys.revoke(user.id, apiKeyId);
  }
}
