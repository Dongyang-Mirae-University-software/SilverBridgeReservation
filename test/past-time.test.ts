/**
 * 오늘(KST) 이미 지난 시각: 예약 생성은 PAST_TIME 으로 거절하고, 빈 시간 조회에서는 뺀다.
 * 기준은 AI·FE와 같다 - 분 단위로 자른 지금 KST 시각 이하면 지난 칸.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-past-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let hospitalId = 0;
const users: number[] = [];
// 2026-10-28 10:00 KST = 2026-10-28 01:00 UTC
const NOW = new Date('2026-10-28T01:00:00.000Z');
const TODAY = '2026-10-28';
const TOMORROW = '2026-10-29';

const clocked = <T extends new (...args: never[]) => object>(Base: T, at: Date) =>
  class extends (Base as new (...args: unknown[]) => object) {
    protected now() {
      return at;
    }
  };

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  prisma = new PrismaService();
  await prisma.$connect();
  hospitalId = (
    await prisma.hospital.create({
      data: {
        name: '가상병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
        status: { create: {} },
        departments: { create: [{ departmentName: '내과' }] },
      },
    })
  ).id;
  for (let i = 0; i < 6; i++) {
    users.push((await prisma.user.create({ data: { email: `p${i}@t.test`, passwordHash: 'x', name: `p${i}`, phone: '010-0000-000' + i } })).id);
  }
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (day: string, time: string) => ({
  hospitalId, department: '내과', reservationDate: day, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;
const reservationAt = (at: Date) => {
  const { ReservationService } = require('../src/reservation/reservation.service');
  const C = clocked(ReservationService, at) as unknown as new (p: unknown) => import('../src/reservation/reservation.service').ReservationService;
  return new C(prisma);
};
const hospitalAt = (at: Date) => {
  const { HospitalService } = require('../src/hospital/hospital.service');
  const C = clocked(HospitalService, at) as unknown as new (p: unknown) => import('../src/hospital/hospital.service').HospitalService;
  return new C(prisma);
};

test('isPastSlotKst - 지금 KST 시각 이하면 지난 칸, 다른 날짜는 판단하지 않는다', () => {
  const { isPastSlotKst } = require('../src/common/utils/time.util');
  assert.equal(isPastSlotKst(TODAY, '09:30', NOW), true);
  assert.equal(isPastSlotKst(TODAY, '10:00', NOW), true); // 정각 = 지남(AI·FE와 같은 기준)
  assert.equal(isPastSlotKst(TODAY, '10:30', NOW), false);
  assert.equal(isPastSlotKst(TOMORROW, '09:00', NOW), false);
  assert.equal(isPastSlotKst(TODAY, '10:00', new Date('2026-10-28T00:59:59.000Z')), false); // 09:59:59 KST
  // KST 23:00(UTC로는 같은 날 14:00)·KST 08:30(UTC로는 전날 23:30)
  assert.equal(isPastSlotKst(TODAY, '22:30', new Date('2026-10-28T14:00:00.000Z')), true);
  assert.equal(isPastSlotKst(TODAY, '09:00', new Date('2026-10-27T23:30:00.000Z')), false);
});

test('오늘 이미 지난 칸은 PAST_TIME 으로 거절하고 예약을 만들지 않는다', async () => {
  const service = reservationAt(NOW);
  for (const [i, t] of ['09:00', '09:30', '10:00'].entries()) {
    await assert.rejects(() => service.create(users[i], dto(TODAY, t)), (e: unknown) => codeOf(e) === 'PAST_TIME');
  }
  assert.equal(await prisma.reservation.count(), 0);
});

test('오늘 아직 안 지난 칸과 내일 이른 칸은 예약된다', async () => {
  const service = reservationAt(NOW);
  assert.equal((await service.create(users[3], dto(TODAY, '10:30'))).status, 'BOOKED');
  assert.equal((await service.create(users[4], dto(TOMORROW, '09:00'))).status, 'BOOKED');
});

test('KST 오전 8:30(UTC 전날)에는 오늘 9:00 을 예약할 수 있다', async () => {
  const service = reservationAt(new Date('2026-10-27T23:30:00.000Z'));
  assert.equal((await service.create(users[5], dto(TODAY, '09:00'))).status, 'BOOKED');
});

test('빈 시간 조회 - 오늘이면 지난 칸을 빼고, 내일은 그대로', async () => {
  const hospitals = hospitalAt(NOW);
  const today = (await hospitals.getAvailableSlots(hospitalId, TODAY, '내과')).availableSlots;
  assert.ok(!today.some((s) => s <= '10:00'), String(today));
  assert.ok(!today.includes('10:30'), '10:30 은 위에서 예약돼 빠진다');
  assert.equal(today[0], '11:00');
  const tomorrow = (await hospitals.getAvailableSlots(hospitalId, TOMORROW, '내과')).availableSlots;
  assert.equal(tomorrow.length, 17); // 18칸 중 09:00 1건 예약
  assert.equal(tomorrow[0], '09:30');
});
