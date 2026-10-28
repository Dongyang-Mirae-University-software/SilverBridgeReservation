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
  weekdayHours: string;
};

/** 그 요일만 기본 진료 시간을 덮어쓰는 값(예: 토요일 09:00~13:00). */
export type WeekdayHours = { weekday: number; openTime: string; closeTime: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function parseClosedWeekdays(value: string | null | undefined): number[] {
  return [...new Set(String(value ?? '').split(',').map((v) => v.trim()).filter((v) => /^[0-6]$/.test(v)).map(Number))].sort();
}

export function formatClosedWeekdays(days: number[] | null | undefined): string {
  return parseClosedWeekdays((days ?? []).join(',')).join(',');
}

/** 저장된 JSON 문자열 → 요일별 진료 시간(형식이 틀린 항목·중복 요일은 버린다, 요일순). */
export function parseWeekdayHours(value: string | null | undefined): WeekdayHours[] {
  let raw: unknown;
  try {
    raw = JSON.parse(String(value ?? '') || '[]');
  } catch {
    return [];
  }
  const seen = new Set<number>();
  const out: WeekdayHours[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const w = (item as WeekdayHours)?.weekday;
    const { openTime, closeTime } = (item ?? {}) as WeekdayHours;
    if (Number.isInteger(w) && w >= 0 && w <= 6 && !seen.has(w) && HHMM.test(String(openTime)) && HHMM.test(String(closeTime)) && openTime < closeTime) {
      seen.add(w);
      out.push({ weekday: w, openTime, closeTime });
    }
  }
  return out.sort((a, b) => a.weekday - b.weekday);
}

export function formatWeekdayHours(list: WeekdayHours[] | null | undefined): string {
  const parsed = parseWeekdayHours(JSON.stringify(list ?? []));
  return parsed.length ? JSON.stringify(parsed) : '';
}

/** 요일별 진료 시간은 요일 0~6·중복 없음·시작 < 끝이어야 한다. */
export function validateWeekdayHours(list: WeekdayHours[] | null | undefined): void {
  const seen = new Set<number>();
  for (const h of list ?? []) {
    if (seen.has(h.weekday) || !(h.openTime < h.closeTime)) {
      throw invalidSchedule('요일별 진료 시간은 요일마다 한 번, 시작이 끝보다 앞서야 합니다.');
    }
    seen.add(h.weekday);
  }
}

/** YYYY-MM-DD 의 요일(0=일). 날짜 문자열 기준이라 서버 시간대와 무관하다. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isClosedOn(schedule: Pick<HospitalSchedule, 'closedWeekdays'>, dateStr: string): boolean {
  return parseClosedWeekdays(schedule.closedWeekdays).includes(weekdayOf(dateStr));
}

/** 그날의 진료 시간 - 그 요일 값이 있으면 그것, 없으면 기본 진료 시간. */
export function hoursForDay(schedule: HospitalSchedule, dateStr: string): { openTime: string; closeTime: string } {
  const day = parseWeekdayHours(schedule.weekdayHours).find((h) => h.weekday === weekdayOf(dateStr));
  return day ? { openTime: day.openTime, closeTime: day.closeTime } : { openTime: schedule.openTime, closeTime: schedule.closeTime };
}

/** 30분 칸이 점심시간과 겹치는가(칸 시작 < 점심 끝 && 칸 끝 > 점심 시작). 점심시간이 그날 진료 시간 안에 다 들지 않으면
 * 그날은 점심시간이 없는 것으로 본다(예: 토요일 09:00~13:00 반일에는 12:30~13:30 점심을 적용하지 않는다). */
function overlapsBreak(slot: string, schedule: HospitalSchedule, hours: { openTime: string; closeTime: string }): boolean {
  if (!schedule.breakStart || !schedule.breakEnd) return false;
  if (schedule.breakStart < hours.openTime || schedule.breakEnd > hours.closeTime) return false;
  const s = parseTimeToMinutes(slot);
  return s < parseTimeToMinutes(schedule.breakEnd) && s + 30 > parseTimeToMinutes(schedule.breakStart);
}

/** 그날 예약 가능한 30분 칸(휴진 요일이면 빈 목록, 그 요일 진료 시간 기준, 점심시간과 겹치는 칸 제외).
 * 예약된 칸·지난 칸은 호출자가 뺀다. */
export function slotsForDay(schedule: HospitalSchedule, dateStr: string): string[] {
  if (isClosedOn(schedule, dateStr)) return [];
  const hours = hoursForDay(schedule, dateStr);
  return generateHalfHourSlots(hours.openTime, hours.closeTime).filter((slot) => !overlapsBreak(slot, schedule, hours));
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
export function scheduleView(h: Pick<HospitalSchedule, 'breakStart' | 'breakEnd' | 'closedWeekdays' | 'weekdayHours'>) {
  return {
    breakStart: h.breakStart ?? null,
    breakEnd: h.breakEnd ?? null,
    closedWeekdays: parseClosedWeekdays(h.closedWeekdays),
    weekdayHours: parseWeekdayHours(h.weekdayHours),
  };
}
