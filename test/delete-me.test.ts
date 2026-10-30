/**
 * 본인 계정 삭제(DELETE /users/me, 2026-10-30): 내 예약·API 키·회원 행만 한 트랜잭션으로 지운다. 관리자는 403.
 * 실행: pnpm test  (= node --import tsx --test test/*.test.ts)
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const root = join(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'resv-delme-'));
process.env.DATABASE_URL = `file:${join(dir, 'test.db')}`;

/* eslint-disable @typescript-eslint/no-var-requires */
let prisma: import('../src/prisma/prisma.service').PrismaService;
let service: import('../src/users/users.service').UsersService;
let hospitalId = 0;
let day = 1;

before(async () => {
  execFileSync(join(root, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], { cwd: root, env: process.env, stdio: 'pipe' });
  const { PrismaService } = require('../src/prisma/prisma.service');
  const { UsersService } = require('../src/users/users.service');
  prisma = new PrismaService();
  await prisma.$connect();
  service = new UsersService(prisma);
  hospitalId = (
    await prisma.hospital.create({
      data: { name: '가상병원', region: '서울', address: 'x', phone: '02-0000-0000', openTime: '09:00', closeTime: '18:00', status: { create: {} } },
    })
  ).id;
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

async function userWithData(tag: string, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await prisma.user.create({ data: { email: `${tag}@t.test`, passwordHash: 'x', name: tag, phone: '010-0000-0000', role } });
  const date = new Date(Date.UTC(2026, 10, day++));
  for (const time of ['09:00', '10:00']) {
    await prisma.reservation.create({
      data: {
        hospitalId, userId: user.id, patientName: '환자', phone: '010-1111-2222', department: '내과',
        reservationDate: date, reservationTime: time, symptomSummary: '증상',
      },
    });
  }
  await prisma.apiKey.create({ data: { userId: user.id, name: `AI-${tag}`, keyPrefix: `pfx${tag}`, keyHash: 'h' } });
  return user;
}

test('내 예약·API 키·회원 행을 지우고 남의 데이터는 남긴다', async () => {
  const me = await userWithData('me');
  const other = await userWithData('other');
  const out = await service.deleteMe({ id: me.id, role: 'USER' });
  assert.deepEqual(out, { deleted: true, reservations: 2, apiKeys: 1 });
  assert.equal(await prisma.user.count({ where: { id: me.id } }), 0);
  assert.equal(await prisma.reservation.count({ where: { userId: me.id } }), 0);
  assert.equal(await prisma.apiKey.count({ where: { userId: me.id } }), 0);
  assert.equal(await prisma.reservation.count({ where: { userId: other.id } }), 2);
  assert.equal(await prisma.apiKey.count({ where: { userId: other.id } }), 1);
});

test('예약이 없는 회원도 지운다, 다시 불러도 오류가 아니다', async () => {
  const user = await prisma.user.create({ data: { email: 'empty@t.test', passwordHash: 'x', name: 'e', phone: '010-0000-0000' } });
  assert.deepEqual(await service.deleteMe({ id: user.id, role: 'USER' }), { deleted: true, reservations: 0, apiKeys: 0 });
  assert.deepEqual(await service.deleteMe({ id: user.id, role: 'USER' }), { deleted: true, reservations: 0, apiKeys: 0 });
});

test('관리자 계정은 403이고 아무것도 지우지 않는다', async () => {
  const admin = await userWithData('admin1', 'ADMIN');
  await assert.rejects(service.deleteMe({ id: admin.id, role: 'ADMIN' }), (e: { status?: number }) => e.status === 403);
  assert.equal(await prisma.user.count({ where: { id: admin.id } }), 1);
  assert.equal(await prisma.reservation.count({ where: { userId: admin.id } }), 2);
});
