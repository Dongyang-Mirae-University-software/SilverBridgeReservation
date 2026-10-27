import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationStatus, ReservationStatus } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { activeSlotConflict, duplicateReservation, slotTaken } from '../common/active-slot-conflict';
import { HttpStatus } from '@nestjs/common';
import { atStartOfDayUtc, generateHalfHourSlots, parseTimeToMinutes, todayKst } from '../common/utils/time.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

const ACTIVE: ReservationStatus[] = [ReservationStatus.BOOKED, ReservationStatus.CONFIRMED];

@Injectable()
export class ReservationService {
  constructor(private readonly prisma: PrismaService) {}

  /** 현재 시각. 테스트가 KST 날짜 경계(00~09시)를 재현하려고 덮어쓴다. */
  protected now(): Date {
    return new Date();
  }

  async create(userId: number, dto: CreateReservationDto) {
    const day = atStartOfDayUtc(dto.reservationDate);
    const todayStr = todayKst(this.now());
    if (dto.reservationDate < todayStr) {
      throw new AppException('INVALID_REQUEST', '예약 날짜는 오늘 이후여야 합니다.', HttpStatus.BAD_REQUEST);
    }

    const hospital = await this.prisma.hospital.findFirst({
      where: { id: dto.hospitalId, deleted: false },
      include: {
        status: true,
        departments: { where: { active: true } },
      },
    });
    if (!hospital) {
      throw new AppException('NOT_FOUND', '병원을 찾을 수 없습니다.', HttpStatus.NOT_FOUND);
    }
    if (!hospital.bookingAvailable) {
      throw new AppException('BOOKING_CLOSED', '해당 병원은 예약을 받지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    const st = hospital.status;
    if (!st || st.operationStatus !== OperationStatus.OPEN || !st.acceptingPatients) {
      throw new AppException('HOSPITAL_CLOSED', '현재 예약 가능한 상태가 아닙니다.', HttpStatus.BAD_REQUEST);
    }

    const deptOk = hospital.departments.some(
      (d) => d.departmentName === dto.department,
    );
    if (!deptOk) {
      throw new AppException('INVALID_DEPARTMENT', '선택한 진료과가 병원에 없습니다.', HttpStatus.BAD_REQUEST);
    }

    const slots = generateHalfHourSlots(hospital.openTime, hospital.closeTime);
    if (!slots.includes(dto.reservationTime)) {
      throw new AppException('INVALID_TIME', '예약 시간이 병원 운영시간 또는 슬롯에 맞지 않습니다.', HttpStatus.BAD_REQUEST);
    }
    const openM = parseTimeToMinutes(hospital.openTime);
    const closeM = parseTimeToMinutes(hospital.closeTime);
    const curM = parseTimeToMinutes(dto.reservationTime);
    if (Number.isNaN(curM) || curM < openM || curM >= closeM) {
      throw new AppException('INVALID_TIME', '예약 시간이 병원 운영시간 외입니다.', HttpStatus.BAD_REQUEST);
    }

    const dupUser = await this.prisma.reservation.findFirst({
      where: {
        userId,
        reservationDate: day,
        reservationTime: dto.reservationTime,
        status: { in: ACTIVE },
      },
    });
    if (dupUser) {
      throw duplicateReservation();
    }

    // 시간 칸은 진료과마다 따로다 - 같은 병원이라도 내과 10시와 안과 10시는 서로 막지 않는다.
    const dupSlot = await this.prisma.reservation.findFirst({
      where: {
        hospitalId: dto.hospitalId,
        department: dto.department,
        reservationDate: day,
        reservationTime: dto.reservationTime,
        status: { in: ACTIVE },
      },
    });
    if (dupSlot) {
      throw slotTaken();
    }

    const birth = dto.birthDate ? new Date(dto.birthDate) : undefined;

    const res = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          hospitalId: dto.hospitalId,
          userId,
          patientName: dto.patientName,
          phone: dto.phone,
          birthDate: birth,
          department: dto.department,
          reservationDate: day,
          reservationTime: dto.reservationTime,
          symptomSummary: dto.symptomSummary ?? '',
          memo: dto.memo ?? '',
          guardianName: dto.guardianName,
          guardianPhone: dto.guardianPhone,
          urgencyLevel: dto.urgencyLevel,
          symptomSeverity: dto.symptomSeverity,
          emergencyFlag: dto.emergencyFlag ?? false,
          status: ReservationStatus.BOOKED,
        },
        include: { hospital: true },
      });

      if (dto.reservationDate === todayStr && hospital.status) {
        await tx.hospitalStatus.update({
          where: { hospitalId: dto.hospitalId },
          data: { todayReservationCount: { increment: 1 } },
        });
      }

      return created;
    }).catch((e: unknown) => {
      // 위 중복 검사와 INSERT 사이에 다른 요청이 끼어 활성 예약 유니크 인덱스에 걸린 경우 - 같은 오류 코드로 답한다.
      throw activeSlotConflict(e) ?? e;
    });

    return {
      reservationId: res.id,
      status: res.status,
      hospitalName: res.hospital.name,
      department: res.department,
      reservationDate: dto.reservationDate,
      reservationTime: res.reservationTime,
      message: '예약이 완료되었습니다.',
    };
  }

  async listMine(userId: number) {
    const list = await this.prisma.reservation.findMany({
      where: { userId },
      include: { hospital: true },
      orderBy: [{ reservationDate: 'desc' }, { reservationTime: 'desc' }],
    });
    return list.map((r) => ({
      reservationId: r.id,
      hospitalName: r.hospital.name,
      department: r.department,
      reservationDate: r.reservationDate.toISOString().slice(0, 10),
      reservationTime: r.reservationTime,
      status: r.status,
      symptomSummary: r.symptomSummary,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async getOne(reservationId: number, userId: number) {
    const r = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId },
      include: { hospital: true },
    });
    if (!r) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }
    return {
      reservationId: r.id,
      hospitalName: r.hospital.name,
      department: r.department,
      reservationDate: r.reservationDate.toISOString().slice(0, 10),
      reservationTime: r.reservationTime,
      status: r.status,
      symptomSummary: r.symptomSummary,
      memo: r.memo,
      patientName: r.patientName,
      phone: r.phone,
      createdAt: r.createdAt.toISOString(),
    };
  }

  async cancel(reservationId: number, userId: number) {
    const r = await this.prisma.reservation.findFirst({
      where: { id: reservationId, userId },
    });
    if (!r) {
      throw new NotFoundException('예약을 찾을 수 없습니다.');
    }
    if (r.status !== ReservationStatus.BOOKED && r.status !== ReservationStatus.CONFIRMED) {
      throw new AppException('INVALID_STATUS', '취소할 수 없는 예약 상태입니다.', HttpStatus.BAD_REQUEST);
    }
    await this.prisma.reservation.update({
      where: { id: reservationId },
      data: { status: ReservationStatus.CANCELED },
    });
    return { reservationId, status: ReservationStatus.CANCELED, message: '예약이 취소되었습니다.' };
  }
}
