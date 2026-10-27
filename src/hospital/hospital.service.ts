import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CongestionLevel, OperationStatus, Prisma, ReservationStatus } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { countTodayReservations } from '../common/today-reservation-count';
import { PrismaService } from '../prisma/prisma.service';
import { HospitalQueryDto } from './dto/hospital-query.dto';
import { atStartOfDayUtc, generateHalfHourSlots, isPastSlotKst } from '../common/utils/time.util';

const ACTIVE_RESERVATION: ReservationStatus[] = [
  ReservationStatus.BOOKED,
  ReservationStatus.CONFIRMED,
];

@Injectable()
export class HospitalService {
  constructor(private readonly prisma: PrismaService) {}

  /** 현재 시각. 테스트가 KST 시각 경계를 재현하려고 덮어쓴다. */
  protected now(): Date {
    return new Date();
  }

  private mapHospitalListRow(h: {
    id: number;
    name: string;
    region: string;
    address: string;
    phone: string;
    description: string;
    openTime: string;
    closeTime: string;
    bookingAvailable: boolean;
    departments: { departmentName: string }[];
    status: {
      operationStatus: OperationStatus;
      congestionLevel: CongestionLevel;
    } | null;
  }) {
    const st = h.status;
    return {
      id: h.id,
      name: h.name,
      region: h.region,
      address: h.address,
      phone: h.phone,
      departments: h.departments.map((d) => d.departmentName),
      operationStatus: st?.operationStatus ?? OperationStatus.CLOSED,
      congestionLevel: st?.congestionLevel ?? CongestionLevel.NORMAL,
      bookingAvailable: h.bookingAvailable,
      description: h.description,
      openTime: h.openTime,
      closeTime: h.closeTime,
    };
  }

  async list(query: HospitalQueryDto) {
    const where: Prisma.HospitalWhereInput = { deleted: false };

    if (query.name) {
      where.name = { contains: query.name };
    }
    if (query.region) {
      where.region = { contains: query.region };
    }
    if (query.bookingAvailable !== undefined) {
      where.bookingAvailable = query.bookingAvailable;
    }
    if (query.operationStatus) {
      where.status = { is: { operationStatus: query.operationStatus } };
    }
    if (query.department) {
      where.departments = {
        some: {
          active: true,
          departmentName: { contains: query.department },
        },
      };
    }

    const rows = await this.prisma.hospital.findMany({
      where,
      include: {
        departments: { where: { active: true } },
        status: true,
      },
      orderBy: { id: 'asc' },
    });
    return rows.map((h) => this.mapHospitalListRow(h));
  }

  async getById(hospitalId: number) {
    const h = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
      include: {
        departments: { where: { active: true } },
        status: true,
      },
    });
    if (!h) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    return this.mapHospitalListRow(h);
  }

  async getStatus(hospitalId: number) {
    const h = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
      include: { status: true },
    });
    if (!h || !h.status) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    const s = h.status;
    return {
      hospitalId: h.id,
      operationStatus: s.operationStatus,
      congestionLevel: s.congestionLevel,
      waitingCount: s.waitingCount,
      averageWaitingMinutes: s.averageWaitingMinutes,
      todayReservationCount: (await countTodayReservations(this.prisma, [h.id], this.now())).get(h.id) ?? 0,
      acceptingPatients: s.acceptingPatients,
      notice: s.notice,
    };
  }

  async getDepartments(hospitalId: number) {
    const h = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
      include: {
        departments: { where: { active: true }, orderBy: { id: 'asc' } },
      },
    });
    if (!h) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    return {
      hospitalId: h.id,
      departments: h.departments.map((d) => ({
        id: d.id,
        name: d.departmentName,
        active: d.active,
      })),
    };
  }

  /**
   * 빈 시간. 시간 칸은 진료과마다 따로라 department 를 주면 그 진료과의 활성 예약만 뺀다.
   * department 를 생략하면 예전처럼 병원 전체 예약을 뺀다 - 진료과를 모르는 옛 호출자가 빈 칸을 실제보다 많게 보지 않게 한다.
   */
  async getAvailableSlots(hospitalId: number, dateStr: string, department?: string) {
    const h = await this.prisma.hospital.findFirst({
      where: { id: hospitalId, deleted: false },
      include: { status: true, departments: { where: { active: true } } },
    });
    if (!h) {
      throw new NotFoundException('병원을 찾을 수 없습니다.');
    }
    const dept = department?.trim() || undefined;
    if (dept && !h.departments.some((d) => d.departmentName === dept)) {
      throw new AppException('INVALID_DEPARTMENT', '선택한 진료과가 병원에 없습니다.', HttpStatus.BAD_REQUEST);
    }
    const day = atStartOfDayUtc(dateStr);
    const allSlots = generateHalfHourSlots(h.openTime, h.closeTime);

    const booked = await this.prisma.reservation.findMany({
      where: {
        hospitalId,
        ...(dept ? { department: dept } : {}),
        reservationDate: day,
        status: { in: ACTIVE_RESERVATION },
      },
      select: { reservationTime: true },
    });
    const taken = new Set(booked.map((b) => b.reservationTime));
    // 오늘이면 이미 지난 칸도 뺀다(예약 생성이 PAST_TIME 으로 거절하는 칸)
    const now = this.now();
    const availableSlots = allSlots.filter((s) => !taken.has(s) && !isPastSlotKst(dateStr, s, now));

    return {
      hospitalId: h.id,
      date: dateStr,
      availableSlots,
    };
  }
}
