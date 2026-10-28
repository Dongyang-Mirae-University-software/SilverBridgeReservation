import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  CongestionLevel,
  OperationStatus,
  Prisma,
  ReservationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { atStartOfDayUtc, todayKst } from '../common/utils/time.util';
import { activeSlotConflict } from '../common/active-slot-conflict';
import { AppException } from '../common/app.exception';
import { countTodayReservations, withTodayCount } from '../common/today-reservation-count';
import { formatClosedWeekdays, formatWeekdayHours, scheduleView, validateSchedule, validateWeekdayHours } from '../common/hospital-schedule';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';
import { UpdateHospitalStatusDto } from './dto/update-hospital-status.dto';
import { AdminReservationQueryDto } from './dto/admin-reservation-query.dto';
import { UpdateReservationStatusAdminDto } from '../reservation/dto/update-reservation-status-admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** 현재 시각. 테스트가 KST 날짜 경계를 재현하려고 덮어쓴다. */
  protected now(): Date {
    return new Date();
  }

  private static formatUserRow(user: {
    id: number;
    email: string;
    name: string;
    phone: string;
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
    _count?: { reservations?: number; adminLogs?: number };
  }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      reservationCount: user._count?.reservations ?? 0,
      adminLogCount: user._count?.adminLogs ?? 0,
    };
  }

  async logAction(
    adminUserId: number,
    targetType: string,
    targetId: number,
    actionType: string,
    before: unknown,
    after: unknown,
  ) {
    await this.prisma.adminActionLog.create({
      data: {
        adminUserId,
        targetType,
        targetId,
        actionType,
        beforeValue: JSON.stringify(before ?? {}),
        afterValue: JSON.stringify(after ?? {}),
      },
    });
  }

  async listUsers(query?: { q?: string; role?: UserRole }) {
    const q = query?.q?.trim();
    const where: Prisma.UserWhereInput = {};
    if (query?.role) {
      where.role = query.role;
    }
    if (q) {
      where.OR = [
        { email: { contains: q } },
        { name: { contains: q } },
        { phone: { contains: q } },
      ];
    }

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { id: 'asc' },
      include: {
        _count: {
          select: { reservations: true, adminLogs: true },
        },
      },
    });
    return rows.map((user) => AdminService.formatUserRow(user));
  }

  async getUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: { reservations: true, adminLogs: true },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }
    return AdminService.formatUserRow(user);
  }

  async createUser(
    adminUserId: number,
    dto: { email: string; password: string; name: string; phone: string; role?: UserRole },
  ) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException('이미 등록된 이메일입니다.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: dto.role ?? UserRole.USER,
      },
      include: {
        _count: {
          select: { reservations: true, adminLogs: true },
        },
      },
    });
    await this.logAction(adminUserId, 'User', created.id, 'CREATE', {}, {
      email: created.email,
      name: created.name,
      phone: created.phone,
      role: created.role,
    });
    return AdminService.formatUserRow(created);
  }

  async updateUser(
    adminUserId: number,
    userId: number,
    dto: { name?: string; phone?: string; role?: UserRole; password?: string },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException('회원을 찾을 수 없습니다.');
    }
    if (!dto.name && !dto.phone && !dto.role && !dto.password) {
      throw new BadRequestException('변경할 항목이 없습니다.');
    }
    if (existing.role === UserRole.ADMIN && dto.role === UserRole.USER) {
      const adminCount = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        throw new BadRequestException('마지막 관리자의 권한은 USER로 변경할 수 없습니다.');
      }
    }

    const before = { name: existing.name, phone: existing.phone, role: existing.role };
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.phone !== undefined) {
      data.phone = dto.phone;
    }
    if (dto.role !== undefined) {
      data.role = dto.role;
    }
    if (dto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: {
        _count: {
          select: { reservations: true, adminLogs: true },
        },
      },
    });

    await this.logAction(adminUserId, 'User', userId, 'UPDATE', before, {
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      passwordReset: dto.password !== undefined,
    });

    return AdminService.formatUserRow(updated);
  }

  async listHospitals() {
    const rows = await this.prisma.hospital.findMany({
      where: { deleted: false },
      include: { status: true, departments: { where: { active: true } } },
      orderBy: { id: 'asc' },
    });
    const counts = await countTodayReservations(this.prisma, rows.map((h) => h.id), this.now());
    return rows.map((h) => ({ ...withTodayCount(h, counts), ...scheduleView(h) }));
  }

  async createHospital(dto: CreateHospitalDto) {
    validateSchedule(dto.openTime, dto.closeTime, dto.breakStart ?? null, dto.breakEnd ?? null);
    validateWeekdayHours(dto.weekdayHours);
    const created = await this.prisma.$transaction(async (tx) => {
      const h = await tx.hospital.create({
        data: {
          name: dto.name,
          region: dto.region,
          address: dto.address,
          phone: dto.phone,
          description: dto.description ?? '',
          openTime: dto.openTime,
          closeTime: dto.closeTime,
          breakStart: dto.breakStart ?? null,
          breakEnd: dto.breakEnd ?? null,
          closedWeekdays: formatClosedWeekdays(dto.closedWeekdays),
          weekdayHours: formatWeekdayHours(dto.weekdayHours),
          bookingAvailable: dto.bookingAvailable ?? true,
        },
      });
      await tx.hospitalStatus.create({
        data: {
          hospitalId: h.id,
          operationStatus: OperationStatus.OPEN,
          congestionLevel: CongestionLevel.NORMAL,
          waitingCount: 0,
          averageWaitingMinutes: 0,
          todayReservationCount: 0,
          acceptingPatients: true,
          notice: '',
        },
      });
      await tx.hospitalDepartment.createMany({
        data: dto.departments.map((name) => ({
          hospitalId: h.id,
          departmentName: name,
          active: true,
        })),
      });
      return tx.hospital.findUniqueOrThrow({
        where: { id: h.id },
        include: { status: true, departments: true },
      });
    });
    return { ...created, ...scheduleView(created) };
  }

  async updateHospital(hospitalId: number, dto: UpdateHospitalDto) {
    const existing = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
    });
    if (!existing) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    const { closedWeekdays, weekdayHours, ...rest } = dto;
    validateWeekdayHours(weekdayHours);
    // 점심시간·진료 시간은 바뀐 뒤의 조합으로 검사한다(한쪽만 보내도 기존 값과 맞아야 한다). null 은 점심시간 지우기.
    const next = {
      openTime: dto.openTime ?? existing.openTime,
      closeTime: dto.closeTime ?? existing.closeTime,
      breakStart: dto.breakStart !== undefined ? dto.breakStart : existing.breakStart,
      breakEnd: dto.breakEnd !== undefined ? dto.breakEnd : existing.breakEnd,
    };
    validateSchedule(next.openTime, next.closeTime, next.breakStart ?? null, next.breakEnd ?? null);
    const updated = await this.prisma.hospital.update({
      where: { id: hospitalId },
      data: {
        ...rest,
        ...(closedWeekdays !== undefined ? { closedWeekdays: formatClosedWeekdays(closedWeekdays) } : {}),
        ...(weekdayHours !== undefined ? { weekdayHours: formatWeekdayHours(weekdayHours) } : {}),
      },
      include: { status: true, departments: { where: { active: true } } },
    });
    return { ...withTodayCount(updated, await countTodayReservations(this.prisma, [hospitalId], this.now())), ...scheduleView(updated) };
  }

  async softDeleteHospital(hospitalId: number) {
    const existing = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
    });
    if (!existing) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    return this.prisma.hospital.update({
      where: { id: hospitalId },
      data: { deleted: true },
    });
  }

  async updateHospitalStatus(
    adminUserId: number,
    hospitalId: number,
    dto: UpdateHospitalStatusDto,
  ) {
    const row = await this.prisma.hospitalStatus.findUnique({
      where: { hospitalId },
    });
    if (!row) {
      throw new NotFoundException('병원 상태를 찾을 수 없습니다.');
    }
    const before = { ...row };
    const updated = await this.prisma.hospitalStatus.update({
      where: { hospitalId },
      data: {
        ...dto,
      },
    });
    await this.logAction(adminUserId, 'HospitalStatus', hospitalId, 'UPDATE_STATUS', before, updated);
    const counts = await countTodayReservations(this.prisma, [hospitalId], this.now());
    return { ...updated, todayReservationCount: counts.get(hospitalId) ?? 0 };
  }

  async addDepartment(hospitalId: number, name: string) {
    const h = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
    });
    if (!h) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    return this.prisma.hospitalDepartment.create({
      data: { hospitalId, departmentName: name, active: true },
    });
  }

  async updateDepartment(departmentId: number, dto: { name?: string; active?: boolean }) {
    const d = await this.prisma.hospitalDepartment.findUnique({
      where: { id: departmentId },
    });
    if (!d) {
      throw new NotFoundException('진료과를 찾을 수 없습니다.');
    }
    const newName = dto.name ?? d.departmentName;
    if (newName === d.departmentName) {
      return this.prisma.hospitalDepartment.update({
        where: { id: departmentId },
        data: { active: dto.active ?? d.active },
      });
    }
    // 예약은 진료과를 이름 문자열로 들고 있고 시간 칸은 (병원, 진료과, 날짜, 시간)이다.
    // 이름만 바꾸면 옛 이름의 예약이 새 이름의 시간 칸을 막지 못해 같은 시간이 두 번 잡히므로,
    // 오늘(KST) 이후의 활성 예약을 한 트랜잭션에서 새 이름으로 옮긴다. 지난·완료·취소 예약은 기록이라 옛 이름 그대로.
    return this.prisma
      .$transaction(async (tx) => {
        const clash = await tx.hospitalDepartment.findFirst({
          where: { hospitalId: d.hospitalId, departmentName: newName, active: true, id: { not: departmentId } },
        });
        if (clash) {
          throw departmentDuplicated();
        }
        const updated = await tx.hospitalDepartment.update({
          where: { id: departmentId },
          data: { departmentName: newName, active: dto.active ?? d.active },
        });
        await tx.reservation.updateMany({
          where: {
            hospitalId: d.hospitalId,
            department: d.departmentName,
            status: { in: [ReservationStatus.BOOKED, ReservationStatus.CONFIRMED] },
            reservationDate: { gte: atStartOfDayUtc(todayKst()) },
          },
          data: { department: newName },
        });
        return updated;
      })
      .catch((e: unknown) => {
        // 사용 중지된 같은 이름 진료과의 예약과 시간 칸이 겹치면 인덱스가 막는다 - 전체 롤백 후 같은 오류로 답한다.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw departmentDuplicated();
        }
        throw e;
      });
  }

  async deleteDepartment(departmentId: number) {
    const d = await this.prisma.hospitalDepartment.findUnique({
      where: { id: departmentId },
    });
    if (!d) {
      throw new NotFoundException('진료과를 찾을 수 없습니다.');
    }
    await this.prisma.hospitalDepartment.update({
      where: { id: departmentId },
      data: { active: false },
    });
    return { id: departmentId, deleted: true };
  }

  async listReservations(query: AdminReservationQueryDto) {
    const where: Prisma.ReservationWhereInput = {};
    if (query.hospitalId) {
      where.hospitalId = query.hospitalId;
    }
    if (query.date) {
      where.reservationDate = atStartOfDayUtc(query.date);
    }
    if (query.status) {
      where.status = query.status;
    }
    const list = await this.prisma.reservation.findMany({
      where,
      include: { hospital: true, user: { select: { id: true, email: true, name: true } } },
      orderBy: [{ reservationDate: 'desc' }, { reservationTime: 'desc' }],
    });
    return list.map((r) => ({
      reservationId: r.id,
      hospitalId: r.hospitalId,
      hospitalName: r.hospital.name,
      userId: r.userId,
      userEmail: r.user.email,
      patientName: r.patientName,
      phone: r.phone,
      department: r.department,
      reservationDate: r.reservationDate.toISOString().slice(0, 10),
      reservationTime: r.reservationTime,
      status: r.status,
      symptomSummary: r.symptomSummary,
      memo: r.memo,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getReservation(reservationId: number) {
    const r = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { hospital: true, user: { select: { id: true, email: true, name: true, phone: true } } },
    });
    if (!r) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }
    return {
      reservationId: r.id,
      hospitalName: r.hospital.name,
      user: r.user,
      patientName: r.patientName,
      phone: r.phone,
      birthDate: r.birthDate?.toISOString().slice(0, 10),
      department: r.department,
      reservationDate: r.reservationDate.toISOString().slice(0, 10),
      reservationTime: r.reservationTime,
      status: r.status,
      symptomSummary: r.symptomSummary,
      memo: r.memo,
      guardianName: r.guardianName,
      guardianPhone: r.guardianPhone,
      urgencyLevel: r.urgencyLevel,
      symptomSeverity: r.symptomSeverity,
      emergencyFlag: r.emergencyFlag,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async updateReservationStatus(
    adminUserId: number,
    reservationId: number,
    dto: UpdateReservationStatusAdminDto,
  ) {
    const r = await this.prisma.reservation.findUnique({ where: { id: reservationId } });
    if (!r) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }
    const before = { status: r.status, memo: r.memo };
    // 취소·완료된 예약을 다시 BOOKED/CONFIRMED 로 돌릴 때 같은 슬롯의 활성 예약과 겹치면 인덱스가 막는다.
    const updated = await this.prisma.reservation
      .update({
        where: { id: reservationId },
        data: {
          status: dto.status,
          memo: dto.memo !== undefined ? dto.memo : r.memo,
        },
      })
      .catch((e: unknown) => {
        throw activeSlotConflict(e) ?? e;
      });
    await this.logAction(adminUserId, 'Reservation', reservationId, 'UPDATE_STATUS', before, {
      status: updated.status,
      memo: updated.memo,
    });
    return updated;
  }

  async dashboard() {
    const todayStr = todayKst();
    const todayStart = atStartOfDayUtc(todayStr);

    const [todayTotal, byStatus, hospitals, congestionRows, opRows] = await Promise.all([
      this.prisma.reservation.count({ where: { reservationDate: todayStart } }),
      this.prisma.reservation.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.reservation.groupBy({
        by: ['hospitalId'],
        where: { reservationDate: todayStart },
        _count: { _all: true },
      }),
      this.prisma.hospitalStatus.groupBy({
        by: ['congestionLevel'],
        _count: { _all: true },
      }),
      this.prisma.hospitalStatus.groupBy({
        by: ['operationStatus'],
        _count: { _all: true },
      }),
    ]);

    const hospitalIds = hospitals.map((h) => h.hospitalId);
    const hospitalNames = await this.prisma.hospital.findMany({
      where: { id: { in: hospitalIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(hospitalNames.map((h) => [h.id, h.name]));

    return {
      date: todayStr,
      todayReservationTotal: todayTotal,
      reservationsByHospital: hospitals.map((h) => ({
        hospitalId: h.hospitalId,
        hospitalName: nameMap.get(h.hospitalId) ?? '',
        count: h._count._all,
      })),
      reservationsByStatus: Object.fromEntries(
        byStatus.map((s) => [s.status, s._count._all]),
      ),
      congestionDistribution: Object.fromEntries(
        congestionRows.map((c) => [c.congestionLevel, c._count._all]),
      ),
      operationStatusDistribution: Object.fromEntries(
        opRows.map((o) => [o.operationStatus, o._count._all]),
      ),
    };
  }

  async listActionLogs() {
    return this.prisma.adminActionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { admin: { select: { id: true, email: true, name: true } } },
    });
  }
}

/** 같은 병원에 같은 이름의 진료과가 이미 있다(BE 중계가 먼저 막지만 직접 호출까지 막는 2차 방어). */
function departmentDuplicated(): AppException {
  return new AppException('DEPARTMENT_DUPLICATED', '같은 이름의 진료과가 이미 있습니다.', HttpStatus.BAD_REQUEST);
}
