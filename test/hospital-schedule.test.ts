/**
 * 병원 점심시간·휴진 요일(2026-10-28): 빈 시간에서 점심시간 칸을 빼고, 휴진 요일은 빈 목록.
 * 예약 생성은 점심시간이면 INVALID_TIME, 휴진 요일이면 HOSPITAL_DAY_OFF. 관리자 입력은 진료 시간 안의 점심시간만.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-sched-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let admin: import('../src/admin/admin.service').AdminService;
let service: import('../src/reservation/reservation.service').ReservationService;
let hospitals: import('../src/hospital/hospital.service').HospitalService;
let hospitalId = 0;
let userId = 0;
// 미래의 일요일·월요일(날짜 문자열 기준 요일)
const future = (weekday: number) => {
  const d = new Date(Date.now() + 10 * 86400000);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const SUNDAY = future(0);
const MONDAY = future(1);

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { AdminService } = require('../src/admin/admin.service');
  const { ReservationService } = require('../src/reservation/reservation.service');
  const { HospitalService } = require('../src/hospital/hospital.service');
  prisma = new PrismaService();
  await prisma.$connect();
  admin = new AdminService(prisma);
  service = new ReservationService(prisma);
  hospitals = new HospitalService(prisma);
  const created = await admin.createHospital({
    name: '가상병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
    departments: ['내과'], breakStart: '12:30', breakEnd: '13:30', closedWeekdays: [0],
  } as never);
  hospitalId = created.id;
  userId = (await prisma.user.create({ data: { email: 's@t.test', passwordHash: 'x', name: 's', phone: '010-0000-0000' } })).id;
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (day: string, time: string) => ({
  hospitalId, department: '내과', reservationDate: day, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;

test('slotsForDay - 점심시간과 겹치는 칸을 빼고 휴진 요일은 빈 목록', () => {
  const { slotsForDay, weekdayOf } = require('../src/common/hospital-schedule');
  const sched = { openTime: '09:00', closeTime: '18:00', breakStart: '12:30', breakEnd: '13:30', closedWeekdays: '0,6' };
  const mon = slotsForDay(sched, MONDAY);
  assert.ok(mon.includes('12:00') && mon.includes('13:30'));
  assert.ok(!mon.includes('12:30') && !mon.includes('13:00'));
  assert.equal(mon.length, 16);
  assert.deepEqual(slotsForDay(sched, SUNDAY), []);
  assert.equal(weekdayOf('2026-10-25'), 0); // 2026-10-25 은 일요일
  assert.equal(slotsForDay({ ...sched, breakStart: null, breakEnd: null, closedWeekdays: '' }, SUNDAY).length, 18, '설정이 없으면 예전과 같다');
});

test('빈 시간 조회 - 월요일은 점심시간 칸이 빠지고 일요일(휴진)은 빈 목록', async () => {
  const mon = (await hospitals.getAvailableSlots(hospitalId, MONDAY, '내과')).availableSlots;
  assert.ok(!mon.includes('12:30') && !mon.includes('13:00') && mon.includes('13:30'));
  assert.deepEqual((await hospitals.getAvailableSlots(hospitalId, SUNDAY, '내과')).availableSlots, []);
});

test('예약 생성 - 휴진 요일은 HOSPITAL_DAY_OFF, 점심시간은 INVALID_TIME, 그 밖은 예약된다', async () => {
  await assert.rejects(() => service.create(userId, dto(SUNDAY, '10:00')), (e: unknown) => codeOf(e) === 'HOSPITAL_DAY_OFF');
  await assert.rejects(() => service.create(userId, dto(MONDAY, '12:30')), (e: unknown) => codeOf(e) === 'INVALID_TIME');
  assert.equal((await service.create(userId, dto(MONDAY, '13:30'))).status, 'BOOKED');
});

test('공개 병원 정보·관리자 목록이 점심시간과 휴진 요일(숫자 배열)을 준다', async () => {
  const h = await hospitals.getById(hospitalId);
  assert.equal(h.breakStart, '12:30');
  assert.equal(h.breakEnd, '13:30');
  assert.deepEqual(h.closedWeekdays, [0]);
  const row = (await admin.listHospitals()).find((x: { id: number }) => x.id === hospitalId) as unknown as { closedWeekdays: number[] };
  assert.deepEqual(row.closedWeekdays, [0]);
});

test('관리자 수정 - 진료 시간 밖·한쪽만 있는 점심시간은 INVALID_SCHEDULE, null 은 지우기, 요일은 정렬·중복 제거', async () => {
  await assert.rejects(() => admin.updateHospital(hospitalId, { breakStart: '08:00', breakEnd: '09:30' } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  await assert.rejects(() => admin.updateHospital(hospitalId, { breakStart: '13:00', breakEnd: '12:00' } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  await assert.rejects(() => admin.updateHospital(hospitalId, { breakStart: null } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  // 진료 시간만 줄여 기존 점심시간이 밖으로 밀려나는 것도 막는다(바뀐 뒤 조합으로 검사)
  await assert.rejects(() => admin.updateHospital(hospitalId, { closeTime: '12:00' } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  // 점심시간만 보내도 기존 진료 종료(18:00)와 맞춰 본다
  await assert.rejects(() => admin.updateHospital(hospitalId, { breakStart: '17:30', breakEnd: '18:30' } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  const cleared = await admin.updateHospital(hospitalId, { breakStart: null, breakEnd: null, closedWeekdays: [6, 0, 6] } as never) as unknown as { breakStart: unknown; closedWeekdays: number[] };
  assert.equal(cleared.breakStart, null);
  assert.deepEqual(cleared.closedWeekdays, [0, 6]);
  assert.equal((await prisma.hospital.findUnique({ where: { id: hospitalId } }))?.closedWeekdays, '0,6');
});

test('DTO - 요일은 0~6 정수만, 시각은 HH:mm 만', async () => {
  const { ValidationPipe } = require('@nestjs/common');
  const { UpdateHospitalDto } = require('../src/admin/dto/update-hospital.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  for (const bad of [{ closedWeekdays: [7] }, { closedWeekdays: [1, 1] }, { breakStart: '25:00' }, { closedWeekdays: ['일'] }]) {
    await assert.rejects(() => pipe.transform(bad, { type: 'body', metatype: UpdateHospitalDto }), String(JSON.stringify(bad)));
  }
  const ok = await pipe.transform({ breakStart: null, breakEnd: null, closedWeekdays: [] }, { type: 'body', metatype: UpdateHospitalDto });
  assert.deepEqual(ok.closedWeekdays, []);
});
