/**
 * 요일별 진료 시간(2026-10-28, 예: 토요일 반일): 그 요일만 기본 진료 시간을 덮어쓴다.
 * 점심시간이 그날 진료 시간 안에 다 들지 않으면 그날은 점심시간을 적용하지 않는다. 휴진 요일이 먼저다.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-wh-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let admin: import('../src/admin/admin.service').AdminService;
let service: import('../src/reservation/reservation.service').ReservationService;
let hospitals: import('../src/hospital/hospital.service').HospitalService;
let hospitalId = 0;
let userId = 0;
const future = (weekday: number) => {
  const d = new Date(Date.now() + 10 * 86400000);
  while (d.getUTCDay() !== weekday) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const SAT = future(6);
const MON = future(1);

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
  hospitalId = (await admin.createHospital({
    name: '가상병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
    departments: ['내과'], breakStart: '12:30', breakEnd: '13:30', closedWeekdays: [0],
    weekdayHours: [{ weekday: 6, openTime: '09:00', closeTime: '13:00' }],
  } as never)).id;
  userId = (await prisma.user.create({ data: { email: 'w@t.test', passwordHash: 'x', name: 'w', phone: '010-0000-0000' } })).id;
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (day: string, time: string) => ({
  hospitalId, department: '내과', reservationDate: day, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;

test('토요일은 09:00~13:00 칸만(점심시간 12:30~13:30 은 그날 진료 시간 밖이라 적용 안 함), 월요일은 기본 시간·점심 제외', async () => {
  const sat = (await hospitals.getAvailableSlots(hospitalId, SAT, '내과')).availableSlots;
  assert.deepEqual(sat, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
  const mon = (await hospitals.getAvailableSlots(hospitalId, MON, '내과')).availableSlots;
  assert.equal(mon.length, 16);
  assert.ok(!mon.includes('12:30') && mon.includes('17:30'));
});

test('예약 생성 - 토요일 14:00 은 INVALID_TIME, 토요일 12:30 은 예약된다(반일엔 점심 없음)', async () => {
  await assert.rejects(() => service.create(userId, dto(SAT, '14:00')), (e: unknown) => codeOf(e) === 'INVALID_TIME');
  assert.equal((await service.create(userId, dto(SAT, '12:30'))).status, 'BOOKED');
});

test('응답에 weekdayHours 배열, 관리자 수정으로 바꾸고 빈 배열로 지운다', async () => {
  assert.deepEqual((await hospitals.getById(hospitalId)).weekdayHours, [{ weekday: 6, openTime: '09:00', closeTime: '13:00' }]);
  const changed = await admin.updateHospital(hospitalId, { weekdayHours: [{ weekday: 6, openTime: '10:00', closeTime: '14:00' }, { weekday: 3, openTime: '09:00', closeTime: '12:00' }] } as never) as unknown as { weekdayHours: unknown };
  assert.deepEqual(changed.weekdayHours, [{ weekday: 3, openTime: '09:00', closeTime: '12:00' }, { weekday: 6, openTime: '10:00', closeTime: '14:00' }]);
  const cleared = await admin.updateHospital(hospitalId, { weekdayHours: [] } as never) as unknown as { weekdayHours: unknown };
  assert.deepEqual(cleared.weekdayHours, []);
  assert.equal((await prisma.hospital.findUnique({ where: { id: hospitalId } }))?.weekdayHours, '');
});

test('관리자 입력 - 같은 요일 두 번·시작 >= 끝은 INVALID_SCHEDULE, DTO 는 요일 0~6·HH:mm 만', async () => {
  await assert.rejects(() => admin.updateHospital(hospitalId, { weekdayHours: [{ weekday: 6, openTime: '09:00', closeTime: '13:00' }, { weekday: 6, openTime: '10:00', closeTime: '12:00' }] } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  await assert.rejects(() => admin.updateHospital(hospitalId, { weekdayHours: [{ weekday: 6, openTime: '13:00', closeTime: '09:00' }] } as never), (e: unknown) => codeOf(e) === 'INVALID_SCHEDULE');
  const { ValidationPipe } = require('@nestjs/common');
  const { UpdateHospitalDto } = require('../src/admin/dto/update-hospital.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  for (const bad of [[{ weekday: 7, openTime: '09:00', closeTime: '13:00' }], [{ weekday: 6, openTime: '9:00', closeTime: '13:00' }], [{ weekday: 6, openTime: '09:00' }]]) {
    await assert.rejects(() => pipe.transform({ weekdayHours: bad }, { type: 'body', metatype: UpdateHospitalDto }), JSON.stringify(bad));
  }
});

test('휴진 요일이 요일별 진료 시간보다 먼저다, 저장값이 깨져 있으면 기본 진료 시간으로', () => {
  const { slotsForDay } = require('../src/common/hospital-schedule');
  const base = { openTime: '09:00', closeTime: '10:00', breakStart: null, breakEnd: null };
  assert.deepEqual(slotsForDay({ ...base, closedWeekdays: '6', weekdayHours: '[{"weekday":6,"openTime":"09:00","closeTime":"13:00"}]' }, SAT), []);
  assert.deepEqual(slotsForDay({ ...base, closedWeekdays: '', weekdayHours: 'not-json' }, SAT), ['09:00', '09:30']);
});
