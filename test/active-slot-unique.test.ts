/**
 * 활성 예약 부분 유니크 인덱스(마이그레이션 20261022120000) 검증.
 * 임시 SQLite 에 실제 마이그레이션을 전부 적용한 뒤 실제 서비스 코드를 동시에 호출한다.
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
const dir = mkdtempSync(join(tmpdir(), 'resv-unique-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;
const MIGRATION_SQL = join(root, 'prisma/migrations/20261022120000_active_reservation_unique/migration.sql');

// DATABASE_URL 을 정한 뒤에 불러온다(PrismaClient 가 만들어질 때 읽는다).
/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let service: import('../src/reservation/reservation.service').ReservationService;
let admin: import('../src/admin/admin.service').AdminService;
let hospitalA = 0;
let hospitalB = 0;
const users: number[] = [];
const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { ReservationService } = require('../src/reservation/reservation.service');
  const { AdminService } = require('../src/admin/admin.service');
  prisma = new PrismaService();
  await prisma.$connect();
  service = new ReservationService(prisma);
  admin = new AdminService(prisma);

  const mkHospital = async (name: string) =>
    (
      await prisma.hospital.create({
        data: {
          name, region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
          status: { create: {} },
          departments: { create: [{ departmentName: '내과' }] },
        },
      })
    ).id;
  hospitalA = await mkHospital('A내과');
  hospitalB = await mkHospital('B내과');
  for (let i = 0; i < 8; i++) {
    users.push((await prisma.user.create({ data: { email: `u${i}@t.test`, passwordHash: 'x', name: `u${i}`, phone: '010-0000-000' + i } })).id);
  }
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (hospitalId: number, time: string, day = DAY) => ({
  hospitalId, department: '내과', reservationDate: day, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;

test('같은 사용자가 같은 날짜·시간을 동시에 여러 번 예약해도 1건만 생긴다', async () => {
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => service.create(users[0], dto(hospitalA, '10:00'))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) {
    if (r.status === 'rejected') assert.ok(['DUPLICATE_RESERVATION', 'SLOT_TAKEN'].includes(codeOf(r.reason) ?? ''), String(r.reason));
  }
  assert.equal(await prisma.reservation.count({ where: { userId: users[0], status: ReservationStatus.BOOKED } }), 1);
});

test('다른 사용자들이 같은 병원 슬롯을 동시에 잡으면 1건만 생기고 나머지는 SLOT_TAKEN', async () => {
  const results = await Promise.allSettled(users.slice(1, 7).map((u) => service.create(u, dto(hospitalB, '11:00'))));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) {
    if (r.status === 'rejected') assert.equal(codeOf(r.reason), 'SLOT_TAKEN');
  }
});

test('검사를 건너뛰고 직접 넣어도 인덱스가 막고, 오류 변환은 기존 코드와 같다', async () => {
  const { activeSlotConflict } = require('../src/common/active-slot-conflict');
  const base = {
    patientName: 'p', phone: '010-1', department: '내과', reservationDate: new Date(`${DAY}T00:00:00.000Z`), reservationTime: '12:00',
  };
  await prisma.reservation.create({ data: { ...base, hospitalId: hospitalA, userId: users[1] } });
  // 같은 사용자(병원 다름)
  const sameUser = await prisma.reservation.create({ data: { ...base, hospitalId: hospitalB, userId: users[1] } }).catch((e) => e);
  assert.equal(activeSlotConflict(sameUser)?.code, 'DUPLICATE_RESERVATION');
  // 같은 병원(사용자 다름)
  const sameHospital = await prisma.reservation.create({ data: { ...base, hospitalId: hospitalA, userId: users[2] } }).catch((e) => e);
  assert.equal(activeSlotConflict(sameHospital)?.code, 'SLOT_TAKEN');
  assert.equal(activeSlotConflict(new Error('다른 오류')), null);
});

test('취소·완료된 예약은 슬롯을 막지 않는다 - 취소 뒤 같은 시간대를 다시 예약할 수 있다', async () => {
  const first = await service.create(users[3], dto(hospitalA, '13:00'));
  await service.cancel(first.reservationId, users[3]);
  const again = await service.create(users[3], dto(hospitalA, '13:00'));
  assert.equal(again.status, 'BOOKED');
  // 비활성 상태끼리는 겹쳐도 된다
  const base = { patientName: 'p', phone: '010-1', department: '내과', reservationDate: new Date(`${DAY}T00:00:00.000Z`), reservationTime: '14:00', hospitalId: hospitalA, userId: users[4] };
  await prisma.reservation.create({ data: { ...base, status: ReservationStatus.CANCELED } });
  await prisma.reservation.create({ data: { ...base, status: ReservationStatus.COMPLETED } });
  await prisma.reservation.create({ data: { ...base, status: ReservationStatus.BOOKED } });
});

test('관리자가 취소된 예약을 되살릴 때 활성 예약과 겹치면 기존 코드로 거절된다', async () => {
  const day = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
  const cancelled = await service.create(users[5], dto(hospitalA, '15:00', day));
  await service.cancel(cancelled.reservationId, users[5]);
  await service.create(users[6], dto(hospitalA, '15:00', day)); // 같은 병원 슬롯을 다른 사람이 가져감
  await assert.rejects(
    () => admin.updateReservationStatus(1, cancelled.reservationId, { status: ReservationStatus.BOOKED } as never),
    (e: unknown) => codeOf(e) === 'SLOT_TAKEN',
  );
  const row = await prisma.reservation.findUnique({ where: { id: cancelled.reservationId } });
  assert.equal(row?.status, ReservationStatus.CANCELED);
});

test('마이그레이션은 겹치는 활성 예약이 있으면 실패하고 정리하면 성공한다(롤백 SQL 포함)', async () => {
  const statements = readFileSync(MIGRATION_SQL, 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
  // 지금 DB 는 20261027120000 까지 적용된 상태다 - 현재 인덱스를 내리고 20261022120000 만 다시 시험한 뒤 끝에서 최신 상태로 되돌린다.
  await prisma.$executeRawUnsafe('DROP INDEX "Reservation_active_user_slot_key"');
  await prisma.$executeRawUnsafe('DROP INDEX "Reservation_active_hospital_dept_slot_key"');
  const base = { patientName: 'p', phone: '010-1', department: '내과', reservationDate: new Date(`${DAY}T00:00:00.000Z`), reservationTime: '16:00' };
  const a = await prisma.reservation.create({ data: { ...base, hospitalId: hospitalA, userId: users[7] } });
  await prisma.reservation.create({ data: { ...base, hospitalId: hospitalA, userId: users[0] } }); // 같은 병원 슬롯 겹침
  // 문장을 하나씩 실행한다(Prisma 는 문자열 하나의 여러 문장 중 첫 번째만 실행한다). 병원 슬롯 인덱스에서 실패해야 한다.
  assert.equal(statements.length, 2);
  await prisma.$executeRawUnsafe(statements[0]);
  await assert.rejects(() => prisma.$executeRawUnsafe(statements[1]), /UNIQUE|unique/i);
  await prisma.$executeRawUnsafe('DROP INDEX "Reservation_active_user_slot_key"'); // 롤백 SQL 확인
  await prisma.reservation.update({ where: { id: a.id }, data: { status: ReservationStatus.CANCELED } });
  for (const s of statements) await prisma.$executeRawUnsafe(s);
  const idx = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Reservation_active_%'`);
  assert.deepEqual(idx.map((i) => i.name).sort(), ['Reservation_active_hospital_slot_key', 'Reservation_active_user_slot_key']);
  // 다음 마이그레이션(진료과별 칸)으로 최신 상태 복구
  const next = readFileSync(join(root, 'prisma/migrations/20261027120000_active_slot_per_department/migration.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);
  for (const s of next) await prisma.$executeRawUnsafe(s);
});
