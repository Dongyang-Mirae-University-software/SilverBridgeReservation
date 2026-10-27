/**
 * 진료과 이름 변경: 오늘(KST) 이후 활성 예약은 새 이름으로 따라가 시간 칸을 계속 막고, 지난·취소 예약은 옛 이름을 유지한다.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { ReservationStatus } from '@prisma/client';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-rename-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let admin: import('../src/admin/admin.service').AdminService;
let service: import('../src/reservation/reservation.service').ReservationService;
let hospitals: import('../src/hospital/hospital.service').HospitalService;
let hospitalId = 0;
const dept: Record<string, number> = {};
const users: number[] = [];
const DAY = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const PAST = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
const at = (day: string) => new Date(`${day}T00:00:00.000Z`);

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
  const h = await prisma.hospital.create({
    data: {
      name: '가상병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00',
      status: { create: {} },
      departments: { create: [{ departmentName: '내과' }, { departmentName: '안과' }, { departmentName: '이비인후과', active: false }] },
    },
    include: { departments: true },
  });
  hospitalId = h.id;
  for (const d of h.departments) dept[d.departmentName] = d.id;
  for (let i = 0; i < 6; i++) {
    users.push((await prisma.user.create({ data: { email: `r${i}@t.test`, passwordHash: 'x', name: `r${i}`, phone: '010-0000-000' + i } })).id);
  }
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const dto = (department: string, time: string) => ({
  hospitalId, department, reservationDate: DAY, reservationTime: time, patientName: '환자', phone: '010-1111-2222',
});
const row = (department: string, time: string, userId: number, day = DAY, status: ReservationStatus = ReservationStatus.BOOKED) =>
  prisma.reservation.create({ data: { hospitalId, department, userId, reservationDate: at(day), reservationTime: time, status, patientName: 'p', phone: '010-1' } });
const codeOf = (e: unknown) => (e as { response?: { code?: string } }).response?.code;

test('이름을 바꾸면 미래 활성 예약이 따라가고, 새 이름의 같은 시간 칸은 막힌다', async () => {
  const booked = await service.create(users[0], dto('내과', '10:00'));
  const cancelled = await row('내과', '11:00', users[1], DAY, ReservationStatus.CANCELED);
  const past = await row('내과', '10:00', users[2], PAST);

  const renamed = await admin.updateDepartment(dept['내과'], { name: '소화기내과' });
  assert.equal(renamed.departmentName, '소화기내과');

  const get = (id: number) => prisma.reservation.findUnique({ where: { id } });
  assert.equal((await get(booked.reservationId))?.department, '소화기내과');
  assert.equal((await get(cancelled.id))?.department, '내과', '취소 예약은 기록이라 옛 이름 유지');
  assert.equal((await get(past.id))?.department, '내과', '지난 예약은 기록이라 옛 이름 유지');

  await assert.rejects(() => service.create(users[3], dto('소화기내과', '10:00')), (e: unknown) => codeOf(e) === 'SLOT_TAKEN');
  const slots = (await hospitals.getAvailableSlots(hospitalId, DAY, '소화기내과')).availableSlots;
  assert.ok(!slots.includes('10:00'));
});

test('같은 병원의 다른 활성 진료과와 같은 이름이면 DEPARTMENT_DUPLICATED, 아무것도 바뀌지 않는다', async () => {
  const r = await service.create(users[4], dto('안과', '13:00'));
  await assert.rejects(() => admin.updateDepartment(dept['안과'], { name: '소화기내과' }), (e: unknown) => codeOf(e) === 'DEPARTMENT_DUPLICATED');
  assert.equal((await prisma.hospitalDepartment.findUnique({ where: { id: dept['안과'] } }))?.departmentName, '안과');
  assert.equal((await prisma.reservation.findUnique({ where: { id: r.reservationId } }))?.department, '안과');
});

test('사용 중지된 같은 이름 진료과의 예약과 시간 칸이 겹치면 전체 롤백하고 DEPARTMENT_DUPLICATED', async () => {
  await row('이비인후과', '13:00', users[5]); // 사용 중지 진료과에 남은 활성 예약(안과 13:00 과 같은 칸)
  await assert.rejects(() => admin.updateDepartment(dept['안과'], { name: '이비인후과' }), (e: unknown) => codeOf(e) === 'DEPARTMENT_DUPLICATED');
  assert.equal((await prisma.hospitalDepartment.findUnique({ where: { id: dept['안과'] } }))?.departmentName, '안과', '이름 변경도 롤백');
  assert.equal(await prisma.reservation.count({ where: { hospitalId, department: '안과', status: ReservationStatus.BOOKED } }), 1);
});

test('이름 없이 active 만 바꾸면 예전처럼 진료과만 바뀌고 예약은 그대로', async () => {
  const before = await prisma.reservation.findMany({ orderBy: { id: 'asc' }, select: { id: true, department: true } });
  const off = await admin.updateDepartment(dept['안과'], { active: false });
  assert.equal(off.active, false);
  assert.equal(off.departmentName, '안과');
  const same = await admin.updateDepartment(dept['안과'], { name: '안과', active: true });
  assert.equal(same.active, true);
  assert.deepEqual(await prisma.reservation.findMany({ orderBy: { id: 'asc' }, select: { id: true, department: true } }), before);
});
