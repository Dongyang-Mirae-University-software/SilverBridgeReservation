import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { generateHalfHourSlots, parseTimeToMinutes } from './utils/time.util';

/** 병원 진료 일정(진료 시간 + 점심시간 + 휴진 요일). 빈 시간 계산·예약 검증·응답이 모두 이 한 곳을 쓴다. */
export type HospitalSchedule = {
  openTime: string;
  closeTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  closedWeekdays: string;
};

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function parseClosedWeekdays(value: string | null | undefined): number[] {
  return [...new Set(String(value ?? '').split(',').map((v) => v.trim()).filter((v) => /^[0-6]$/.test(v)).map(Number))].sort();
}

export function formatClosedWeekdays(days: number[] | null | undefined): string {
  return parseClosedWeekdays((days ?? []).join(',')).join(',');
}

/** YYYY-MM-DD 의 요일(0=일). 날짜 문자열 기준이라 서버 시간대와 무관하다. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isClosedOn(schedule: Pick<HospitalSchedule, 'closedWeekdays'>, dateStr: string): boolean {
  return parseClosedWeekdays(schedule.closedWeekdays).includes(weekdayOf(dateStr));
}

/** 30분 칸이 점심시간과 겹치는가(칸 시작 < 점심 끝 && 칸 끝 > 점심 시작). */
function overlapsBreak(slot: string, schedule: HospitalSchedule): boolean {
  if (!schedule.breakStart || !schedule.breakEnd) return false;
  const s = parseTimeToMinutes(slot);
  return s < parseTimeToMinutes(schedule.breakEnd) && s + 30 > parseTimeToMinutes(schedule.breakStart);
}

/** 그날 예약 가능한 30분 칸(휴진 요일이면 빈 목록, 점심시간과 겹치는 칸 제외). 예약된 칸·지난 칸은 호출자가 뺀다. */
export function slotsForDay(schedule: HospitalSchedule, dateStr: string): string[] {
  if (isClosedOn(schedule, dateStr)) return [];
  return generateHalfHourSlots(schedule.openTime, schedule.closeTime).filter((slot) => !overlapsBreak(slot, schedule));
}

function invalidSchedule(message: string): AppException {
  return new AppException('INVALID_SCHEDULE', message, HttpStatus.BAD_REQUEST);
}

/** 점심시간은 둘 다 있거나 둘 다 없고, 진료 시간 안에서 시작 < 끝이어야 한다. */
export function validateSchedule(openTime: string, closeTime: string, breakStart: string | null, breakEnd: string | null): void {
  if (!breakStart && !breakEnd) return;
  if (!breakStart || !breakEnd) throw invalidSchedule('점심시간은 시작과 끝을 함께 정해야 합니다.');
  const [o, c, bs, be] = [openTime, closeTime, breakStart, breakEnd].map(parseTimeToMinutes);
  if ([o, c, bs, be].some(Number.isNaN) || !(o <= bs && bs < be && be <= c)) {
    throw invalidSchedule('점심시간은 진료 시간 안에서 시작이 끝보다 앞서야 합니다.');
  }
}

/** 응답에 싣는 일정 칸(휴진 요일은 숫자 배열). */
export function scheduleView(h: Pick<HospitalSchedule, 'breakStart' | 'breakEnd' | 'closedWeekdays'>) {
  return { breakStart: h.breakStart ?? null, breakEnd: h.breakEnd ?? null, closedWeekdays: parseClosedWeekdays(h.closedWeekdays) };
}
