/**
 * 오늘 예약 수: 예전 칸(1씩 늘리기만 함)이 아니라 오늘(KST) 예약 행을 센다 - 자정이 지나면 0, 취소·거절은 빠진다.
 * 관리자 입력(todayReservationCount)은 받지 않는다.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-today-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let hospitalId = 0;
let otherId = 0;
let userId = 0;
// 2026-10-28 08:00 KST = 2026-10-27 23:00 UTC (UTC 로 자르면 "어제")
const NOW = new Date('2026-10-27T23:00:00.000Z');
const clockOf = <T>(Base: T, at: Date) =>
  class extends (Base as unknown as new (...a: unknown[]) => object) {
    protected now() {
      return at;
    }
  } as unknown as T;

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  prisma = new PrismaService();
  await prisma.$connect();
  const mk = async (name: string) =>
    (await prisma.hospital.create({
      data: {
        name, region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
        status: { create: { todayReservationCount: 7 } }, // 예전 칸의 낡은 누적값 - 읽지 않아야 한다
        departments: { create: [{ departmentName: '내과' }] },
      },
    })).id;
  hospitalId = await mk('가상병원');
  otherId = await mk('다른병원');
  userId = (await prisma.user.create({ data: { email: 't@t.test', passwordHash: 'x', name: 't', phone: '010-0000-0000' } })).id;
  const row = (day: string, time: string, status: ReservationStatus, hid = hospitalId) =>
    prisma.reservation.create({ data: { hospitalId: hid, userId, department: '내과', patientName: 'p', phone: '010-1', reservationDate: new Date(`${day}T00:00:00.000Z`), reservationTime: time, status } });
  await row('2026-10-28', '10:00', ReservationStatus.BOOKED);
  await row('2026-10-28', '11:00', ReservationStatus.CONFIRMED);
  await row('2026-10-28', '12:00', ReservationStatus.COMPLETED);
  await row('2026-10-28', '13:00', ReservationStatus.CANCELED); // 빠짐
  await row('2026-10-28', '14:00', ReservationStatus.REJECTED); // 빠짐
  await row('2026-10-27', '10:00', ReservationStatus.BOOKED); // KST 어제 - 빠짐
  await row('2026-10-29', '10:00', ReservationStatus.BOOKED); // 내일 - 빠짐
  await row('2026-10-28', '16:00', ReservationStatus.BOOKED, otherId); // 다른 병원
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

test('오늘(KST) 예약 행을 센다 - 취소·거절·어제·내일·다른 병원은 빠지고 예전 칸 값(7)은 읽지 않는다', async () => {
  const { countTodayReservations } = require('../src/common/today-reservation-count');
  const counts = await countTodayReservations(prisma, [hospitalId, otherId], NOW);
  assert.equal(counts.get(hospitalId), 3);
  assert.equal(counts.get(otherId), 1);
  // 자정이 지나면(KST 10/29) 다시 센다
  assert.equal((await countTodayReservations(prisma, [hospitalId], new Date('2026-10-28T15:00:00.000Z'))).get(hospitalId), 1);
});

test('공개 병원 상태·관리자 병원 목록·상태 수정 응답이 모두 센 값을 준다', async () => {
  const { HospitalService } = require('../src/hospital/hospital.service');
  const { AdminService } = require('../src/admin/admin.service');
  const hospitals = new (clockOf(HospitalService, NOW))(prisma);
  const admin = new (clockOf(AdminService, NOW))(prisma);
  assert.equal((await hospitals.getStatus(hospitalId)).todayReservationCount, 3);
  const list = await admin.listHospitals();
  assert.equal(list.find((h: { id: number }) => h.id === hospitalId).status.todayReservationCount, 3);
  const adminUser = (await prisma.user.create({ data: { email: 'a@t.test', passwordHash: 'x', name: 'a', phone: '010-9', role: 'ADMIN' } })).id;
  const updated = await admin.updateHospitalStatus(adminUser, hospitalId, { waitingCount: 2 });
  assert.equal(updated.todayReservationCount, 3);
  assert.equal(updated.waitingCount, 2);
});

test('예약을 만들어도 예전 칸을 늘리지 않고, 취소하면 센 값에서 빠진다', async () => {
  const { ReservationService } = require('../src/reservation/reservation.service');
  const { countTodayReservations } = require('../src/common/today-reservation-count');
  const service = new (clockOf(ReservationService, NOW))(prisma);
  const u2 = (await prisma.user.create({ data: { email: 'u2@t.test', passwordHash: 'x', name: 'u2', phone: '010-8' } })).id;
  const r = await service.create(u2, { hospitalId, department: '내과', reservationDate: '2026-10-28', reservationTime: '15:00', patientName: 'p', phone: '010-1111-2222' });
  assert.equal((await countTodayReservations(prisma, [hospitalId], NOW)).get(hospitalId), 4);
  assert.equal((await prisma.hospitalStatus.findUnique({ where: { hospitalId } }))?.todayReservationCount, 7, '예전 칸은 더 이상 늘리지 않는다');
  await service.cancel(r.reservationId, u2);
  assert.equal((await countTodayReservations(prisma, [hospitalId], NOW)).get(hospitalId), 3);
});

test('관리자 상태 수정에 todayReservationCount 를 보내면 400 (입력값으로 받지 않는다)', async () => {
  const { UpdateHospitalStatusDto } = require('../src/admin/dto/update-hospital-status.dto');
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  await assert.rejects(() => pipe.transform({ todayReservationCount: 5 }, { type: 'body', metatype: UpdateHospitalStatusDto }));
  const ok = await pipe.transform({ waitingCount: 1 }, { type: 'body', metatype: UpdateHospitalStatusDto });
  assert.equal(ok.waitingCount, 1);
});
