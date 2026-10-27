import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from './app.exception';

/** 같은 사용자의 같은 날짜·시간에 활성 예약이 이미 있다. */
export function duplicateReservation(): AppException {
  return new AppException('DUPLICATE_RESERVATION', '동일 시간대에 이미 예약이 있습니다.', HttpStatus.BAD_REQUEST);
}

/** 같은 병원·진료과의 같은 날짜·시간 칸이 이미 찼다. */
export function slotTaken(): AppException {
  return new AppException('SLOT_TAKEN', '이미 마감된 시간대입니다.', HttpStatus.BAD_REQUEST);
}

/**
 * 활성 예약 부분 유니크 인덱스(마이그레이션 20261022120000·20261027120000) 위반을 findFirst 중복 검사와 같은 오류 코드로 바꾼다.
 * 검사와 INSERT 사이에 다른 요청이 끼어 인덱스에 걸린 경우다. 해당하지 않는 오류면 null.
 */
export function activeSlotConflict(err: unknown): AppException | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
    return null;
  }
  const target = JSON.stringify((err.meta as { target?: unknown } | undefined)?.target ?? '');
  if (target.includes('hospitalId')) {
    return slotTaken();
  }
  if (target.includes('userId')) {
    return duplicateReservation();
  }
  return null;
}
