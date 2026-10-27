export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

export function minutesToHHMM(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function generateHalfHourSlots(openTime: string, closeTime: string): string[] {
  const open = parseTimeToMinutes(openTime);
  const close = parseTimeToMinutes(closeTime);
  if (Number.isNaN(open) || Number.isNaN(close) || open >= close) {
    return [];
  }
  const slots: string[] = [];
  for (let t = open; t + 30 <= close; t += 30) {
    slots.push(minutesToHHMM(t));
  }
  return slots;
}

export function atStartOfDayUtc(dateStr: string): Date {
  const [y, mo, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 한국(KST) 기준 오늘 날짜(YYYY-MM-DD). 서버(컨테이너)는 UTC라 toISOString() 으로 자르면 KST 00~09시에 하루 밀린다.
 * 예약 날짜는 이 문자열과 비교하고, 저장은 atStartOfDayUtc(날짜 키)로 한다. 한국은 서머타임이 없어 +9시간 고정이다.
 */
export function todayKst(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}
