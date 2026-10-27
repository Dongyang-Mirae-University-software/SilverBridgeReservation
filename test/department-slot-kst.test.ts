/**
 * R-6: 시간 칸은 (병원, 진료과, 날짜, 시간)마다 한 건 / "오늘"은 KST.
 * 임시 SQLite 에 실제 마이그레이션을 전부 적용한 뒤 실제 서비스 코드를 호출한다.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ReservationStatus } from '@prisma/client';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-dept-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
const MIGRATION_SQL = join(root, 'prisma/migrations/20261027120000_active_slot_per_department/migration.sql');

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let service: import('../src/reservation/reservation.service').ReservationService;
let hospitals: import('../src/hospital/hospital.service').HospitalService;
let hospitalId = 0;
const users: number[] = [];
const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { ReservationService } = require('../src/reservation/reservation.service');
  const { HospitalService } = require('../src/hospital/hospital.service');
  prisma = new PrismaService();
  await prisma.$connect();
  service = new ReservationService(prisma);
  hospitals = new HospitalService(prisma);
  hospitalId = (
    await prisma.hospital.create({
      data: {
        name: '종합병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
        status: { create: {} },
        departments: { create: [{ departmentName: '내과' }, { departmentName: '안과' }] },
      },
    })
  ).id;
  for (let i = 0; i < 10; i++) {
    users.push((await prisma.user.create({ data: { email: `d${i}@t.test`, passwordHash: 'x', name: `d${i}`, phone: '010-0000-000' + i } })).id);
  }
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (department: string, time: string, day = DAY) => ({
  hospitalId, department, reservationDate: day, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;

test('같은 병원의 다른 진료과는 같은 시간을 각각 예약할 수 있다', async () => {
  const a = await service.create(users[0], dto('내과', '10:00'));
  const b = await service.create(users[1], dto('안과', '10:00'));
  assert.equal(a.status, 'BOOKED');
  assert.equal(b.status, 'BOOKED');
});

test('같은 진료과 같은 시간에 동시에 6명이 예약하면 1건만 생기고 나머지는 SLOT_TAKEN', async () => {
  const results = await Promise.allSettled(users.slice(2, 8).map((u) => service.create(u, dto('내과', '11:00'))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) {
    if (r.status === 'rejected') assert.equal(codeOf(r.reason), 'SLOT_TAKEN');
  }
  assert.equal(await prisma.reservation.count({ where: { hospitalId, department: '내과', reservationTime: '11:00', status: ReservationStatus.BOOKED } }), 1);
});

test('같은 사용자는 진료과가 달라도 같은 시간에 1건만 (동시 요청)', async () => {
  const results = await Promise.allSettled([
    service.create(users[8], dto('내과', '12:00')),
    service.create(users[8], dto('안과', '12:00')),
    service.create(users[8], dto('내과', '12:00')),
    service.create(users[8], dto('안과', '12:00')),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) {
    if (r.status === 'rejected') assert.ok(['DUPLICATE_RESERVATION', 'SLOT_TAKEN'].includes(codeOf(r.reason) ?? ''), String(r.reason));
  }
});

test('인덱스는 진료과까지 본다 - 검사를 건너뛰고 넣어도 같은 진료과만 막는다', async () => {
  const { activeSlotConflict } = require('../src/common/active-slot-conflict');
  const base = { patientName: 'p', phone: '010-1', reservationDate: new Date(`${DAY}T00:00:00.000Z`), reservationTime: '13:00', hospitalId };
  await prisma.reservation.create({ data: { ...base, department: '내과', userId: users[0] } });
  await prisma.reservation.create({ data: { ...base, department: '안과', userId: users[1] } }); // 다른 진료과 - 통과
  const same = await prisma.reservation.create({ data: { ...base, department: '내과', userId: users[2] } }).catch((e) => e);
  assert.equal(activeSlotConflict(same)?.code, 'SLOT_TAKEN');
});

test('빈 시간은 진료과별로 계산하고, 진료과를 생략하면 병원 전체 기준(예전 동작)', async () => {
  // DAY 의 내과 10:00·11:00·13:00, 안과 10:00·13:00, (사용자 중복 테스트의) 12:00 1건이 차 있다
  const naegwa = (await hospitals.getAvailableSlots(hospitalId, DAY, '내과')).availableSlots;
  const angwa = (await hospitals.getAvailableSlots(hospitalId, DAY, '안과')).availableSlots;
  const all = (await hospitals.getAvailableSlots(hospitalId, DAY)).availableSlots;
  assert.ok(!naegwa.includes('10:00') && !naegwa.includes('11:00') && !naegwa.includes('13:00'));
  assert.ok(angwa.includes('11:00'), '내과만 찬 11:00 은 안과에서 비어 있어야 한다');
  assert.ok(!angwa.includes('10:00') && !angwa.includes('13:00'));
  assert.ok(!all.includes('11:00') && !all.includes('10:00'), '진료과 생략 = 병원 전체 기준');
  await assert.rejects(() => hospitals.getAvailableSlots(hospitalId, DAY, '치과'), (e: unknown) => codeOf(e) === 'INVALID_DEPARTMENT');
});

test('"오늘"은 KST - KST 00~09시(UTC 전날)에도 KST 오늘 예약을 받고, KST 어제는 거절한다', async () => {
  const { ReservationService } = require('../src/reservation/reservation.service');
  const { todayKst } = require('../src/common/utils/time.util');
  // 2026-10-28 08:30 KST = 2026-10-27 23:30 UTC
  const fixed = new Date('2026-10-27T23:30:00.000Z');
  assert.equal(todayKst(fixed), '2026-10-28');
  assert.equal(todayKst(new Date('2026-10-27T14:59:00.000Z')), '2026-10-27'); // 23:59 KST
  assert.equal(todayKst(new Date('2026-10-27T15:00:00.000Z')), '2026-10-28'); // 00:00 KST
  class FixedClock extends ReservationService {
    protected now() {
      return fixed;
    }
  }
  const clocked = new FixedClock(prisma);
  const ok = await clocked.create(users[9], dto('내과', '15:00', '2026-10-28'));
  assert.equal(ok.status, 'BOOKED');
  await assert.rejects(() => clocked.create(users[9], dto('내과', '16:00', '2026-10-27')), (e: unknown) => codeOf(e) === 'INVALID_REQUEST');
  // KST 오늘 예약은 병원 오늘 예약 수에 들어간다
  const st = await prisma.hospitalStatus.findUnique({ where: { hospitalId } });
  assert.equal(st?.todayReservationCount, 1);
});

test('마이그레이션 적용·되돌리기 - 진료과만 다른 예약이 있으면 되돌리기(예전 인덱스)가 실패한다', async () => {
  const sql = readFileSync(MIGRATION_SQL, 'utf8');
  const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(statements.length, 2);
  const rollback = sql.split('\n').filter((l) => l.includes('-- 롤백:') || l.trim().startsWith('--       CREATE'))
    .map((l) => l.replace(/^--\s*(롤백:)?\s*/, '').trim()).join(' ').split(';').map((s) => s.trim()).filter(Boolean);
  assert.equal(rollback.length, 2);
  // 되돌리기: 위 테스트들이 같은 병원·시간에 내과·안과를 넣어 두었으므로 예전 인덱스 생성은 실패해야 한다
  await prisma.$executeRawUnsafe(rollback[0]);
  await assert.rejects(() => prisma.$executeRawUnsafe(rollback[1]), /UNIQUE|unique/i);
  // 다시 적용(첫 문장은 예전 인덱스가 없어 건너뛴다)
  await prisma.$executeRawUnsafe(statements[1]);
  const idx = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Reservation_active_%'`);
  assert.deepEqual(idx.map((i) => i.name).sort(), ['Reservation_active_hospital_dept_slot_key', 'Reservation_active_user_slot_key']);
});
