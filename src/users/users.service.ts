import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 본인 계정 삭제(2026-10-30) - 실버브릿지 회원 탈퇴 때 AI 서버가 그 회원 계정으로 부른다.
   * 예약(환자 이름·전화·증상 요약)·API 키·회원 행을 한 트랜잭션으로 지운다(익명 보존하지 않음).
   * 관리자 계정은 지우지 않는다(관리자 작업 로그가 묶여 있고 운영 계정이 사라진다).
   */
  async deleteMe(user: { id: number; role: string }) {
    if (user.role === 'ADMIN') {
      throw new ForbiddenException({ code: 'ADMIN_CANNOT_DELETE_SELF', message: '관리자 계정은 삭제할 수 없습니다.' });
    }
    const [reservations, apiKeys] = await this.prisma.$transaction([
      this.prisma.reservation.deleteMany({ where: { userId: user.id } }),
      this.prisma.apiKey.deleteMany({ where: { userId: user.id } }),
      this.prisma.user.deleteMany({ where: { id: user.id } }),
    ]);
    return { deleted: true, reservations: reservations.count, apiKeys: apiKeys.count };
  }
}
