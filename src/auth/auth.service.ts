import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signup(dto: SignupDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('이미 등록된 이메일입니다.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: UserRole.USER,
      },
    });
    const token = await this.signToken(user.id, user.email, user.role);
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    const accessToken = await this.signToken(user.id, user.email, user.role);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  /** 관리자 웹 패널: 이메일 없이 패널 비밀번호만으로 JWT 발급 (DB의 ADMIN 역할 사용자 기준) */
  async adminPanelLogin(password: string) {
    const expected = this.config.getOrThrow<string>('ADMIN_PANEL_PASSWORD');
    if (!this.timingSafeEqualString(password, expected)) {
      throw new UnauthorizedException('비밀번호가 올바르지 않습니다.');
    }
    const user = await this.prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      orderBy: { id: 'asc' },
    });
    if (!user) {
      throw new UnauthorizedException('관리자 계정이 없습니다. 시드 데이터를 넣으세요.');
    }
    const accessToken = await this.signToken(user.id, user.email, user.role);
    return {
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }

  private timingSafeEqualString(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a, 'utf8');
      const bb = Buffer.from(b, 'utf8');
      if (ba.length !== bb.length) {
        return false;
      }
      return timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  }

  private signToken(sub: number, email: string, role: UserRole) {
    const payload: JwtPayload = { sub, email, role };
    return this.jwt.signAsync(payload);
  }
}
