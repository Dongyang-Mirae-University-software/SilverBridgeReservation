import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AdminLoginDto } from './dto/admin-login.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: '회원가입' })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: '로그인' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('admin-login')
  @ApiOperation({ summary: '관리자 패널 로그인 (비밀번호만, ADMIN_PANEL_PASSWORD)' })
  adminLogin(@Body() dto: AdminLoginDto) {
    return this.auth.adminPanelLogin(dto.password);
  }
}
