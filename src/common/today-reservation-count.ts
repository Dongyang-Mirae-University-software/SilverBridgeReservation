import { ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { atStartOfDayUtc, todayKst } from './utils/time.util';

/** 오늘 예약 수에 넣는 상태 - 취소·거절은 뺀다(완료·노쇼는 그날 잡혀 있던 예약이라 센다). */
const COUNTED: ReservationStatus[] = [
  ReservationStatus.BOOKED,
  ReservationStatus.CONFIRMED,
  ReservationStatus.COMPLETED,
  ReservationStatus.NO_SHOW,
];

/**
 * 병원별 오늘(KST) 예약 수를 실제 예약 행으로 센다. hospital_status.todayReservationCount 칸은 예전에 1씩 늘리기만 해서
 * 자정에도 0으로 돌아가지 않고 취소도 반영되지 않았다 - 그 칸은 더 이상 읽지 않는다(DB 칸은 남김, 마이그레이션 없음).
 */
export async function countTodayReservations(
  prisma: PrismaService,
  hospitalIds: number[],
  now: Date = new Date(),
): Promise<Map<number, number>> {
  const counts = new Map<number, number>(hospitalIds.map((id) => [id, 0]));
  if (hospitalIds.length === 0) return counts;
  const rows = await prisma.reservation.groupBy({
    by: ['hospitalId'],
    where: { hospitalId: { in: hospitalIds }, reservationDate: atStartOfDayUtc(todayKst(now)), status: { in: COUNTED } },
    _count: { _all: true },
  });
  for (const r of rows) counts.set(r.hospitalId, r._count._all);
  return counts;
}

/** 응답의 status.todayReservationCount 를 센 값으로 바꾼다(status 가 없으면 그대로). */
export function withTodayCount<T extends { id: number; status?: { todayReservationCount: number } | null }>(
  hospital: T,
  counts: Map<number, number>,
): T {
  if (!hospital.status) return hospital;
  return { ...hospital, status: { ...hospital.status, todayReservationCount: counts.get(hospital.id) ?? 0 } };
}
