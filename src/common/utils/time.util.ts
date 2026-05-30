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
