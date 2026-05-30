import {
  PrismaClient,
  OperationStatus,
  CongestionLevel,
  ReservationStatus,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type HospitalSeed = {
  name: string;
  region: string;
  address: string;
  phone: string;
  description: string;
  openTime: string;
  closeTime: string;
  departments: string[];
  status: {
    operationStatus: OperationStatus;
    congestionLevel: CongestionLevel;
    waitingCount: number;
    averageWaitingMinutes: number;
    todayReservationCount: number;
    acceptingPatients: boolean;
    notice: string;
  };
};

const STANDARD_DEPARTMENTS = [
  '내과',
  '안과',
  '이비인후과',
  '정형외과',
  '피부과',
  '소아청소년과',
  '산부인과',
  '신경과',
  '정신건강의학과',
  '가정의학과',
  '응급의학과',
  '외과',
] as const;

function hospital(
  name: string,
  region: string,
  address: string,
  phone: string,
  departments: string[],
  description = '',
  operationStatus: OperationStatus = OperationStatus.OPEN,
  congestionLevel: CongestionLevel = CongestionLevel.NORMAL,
): HospitalSeed {
  const open = operationStatus === OperationStatus.OPEN;
  return {
    name,
    region,
    address,
    phone,
    description,
    openTime: '09:00',
    closeTime: '18:00',
    departments,
    status: {
      operationStatus,
      congestionLevel,
      waitingCount: open ? 4 + (name.length % 12) : 0,
      averageWaitingMinutes: open ? 15 + (name.length % 25) : 0,
      todayReservationCount: open ? 2 + (name.length % 8) : 0,
      acceptingPatients: open,
      notice: open ? '정상 진료 중입니다.' : '현재 예약 접수가 제한될 수 있습니다.',
    },
  };
}

const hospitalData: HospitalSeed[] = [
  // 서울 강남·서초
  hospital('강남하늘안과', '서울 강남구', '서울특별시 강남구 테헤란로 101', '02-2001-0001', ['안과', '내과']),
  hospital('강남메디내과', '서울 강남구', '서울특별시 강남구 역삼로 22', '02-2001-0002', ['내과', '가정의학과']),
  hospital('강남이비인후과의원', '서울 강남구', '서울특별시 강남구 논현로 55', '02-2001-0003', ['이비인후과']),
  hospital('강남365응급의료센터', '서울 강남구', '서울특별시 강남구 선릉로 88', '02-2001-0004', ['응급의학과', '외과', '내과']),
  hospital('메디이비인후과', '서울 강남구', '서울특별시 강남구 테헤란로 100', '02-2001-0005', ['이비인후과', '응급의학과'], '이비인후과 전문', OperationStatus.HOLIDAY),
  hospital('서초바른정형외과', '서울 서초구', '서울특별시 서초구 서초대로 120', '02-2002-0001', ['정형외과', '재활의학과']),
  hospital('서초피부과클리닉', '서울 서초구', '서울특별시 서초구 반포대로 30', '02-2002-0002', ['피부과', '내과']),
  hospital('서초신경과병원', '서울 서초구', '서울특별시 서초구 잠원로 14', '02-2002-0003', ['신경과', '내과']),
  hospital('강남산부인과', '서울 강남구', '서울특별시 강남구 도산대로 45', '02-2001-0006', ['산부인과', '내과']),
  hospital('강남정신건강의학과', '서울 강남구', '서울특별시 강남구 학동로 77', '02-2001-0007', ['정신건강의학과', '내과']),

  // 서울 송파·강동
  hospital('송파소아과의원', '서울 송파구', '서울특별시 송파구 올림픽로 300', '02-2003-0001', ['소아청소년과', '내과']),
  hospital('잠실가정의학과', '서울 송파구', '서울특별시 송파구 올림픽로 240', '02-2003-0002', ['가정의학과', '내과']),
  hospital('강동바른외과', '서울 강동구', '서울특별시 강동구 천호대로 100', '02-2004-0001', ['외과', '내과']),
  hospital('천호안과센터', '서울 강동구', '서울특별시 강동구 양재대로 55', '02-2004-0002', ['안과']),

  // 서울 강북·중부
  hospital('종로전통한의원연계내과', '서울 종로구', '서울특별시 종로구 종로 50', '02-2005-0001', ['내과', '가정의학과']),
  hospital('을지로응급의료센터', '서울 중구', '서울특별시 중구 을지로 66', '02-2005-0002', ['응급의학과', '외과', '내과'], '24시 응급 진료', OperationStatus.OPEN, CongestionLevel.BUSY),
  hospital('용산군인정형외과', '서울 용산구', '서울특별시 용산구 한강대로 120', '02-2006-0001', ['정형외과', '재활의학과']),
  hospital('마포서울안과', '서울 마포구', '서울특별시 마포구 월드컵로 50', '02-2007-0001', ['안과', '이비인후과']),
  hospital('홍대피부과', '서울 마포구', '서울특별시 마포구 양화로 120', '02-2007-0002', ['피부과', '내과']),
  hospital('성북신경과의원', '서울 성북구', '서울특별시 성북구 종암로 20', '02-2008-0001', ['신경과', '내과']),
  hospital('노원가족내과', '서울 노원구', '서울특별시 노원구 상계로 90', '02-2009-0001', ['내과', '가정의학과', '소아청소년과']),

  // 서울 강서·영등포·구로
  hospital('하늘안과', '서울 구로구', '서울특별시 구로구 디지털로 00', '02-2010-0001', ['안과', '내과']),
  hospital('구로정형외과', '서울 구로구', '서울특별시 구로구 새말로 33', '02-2010-0002', ['정형외과', '재활의학과']),
  hospital('은빛내과', '서울 영등포구', '서울특별시 영등포구 여의대로 10', '02-2011-0001', ['내과', '가정의학과']),
  hospital('여의도심장내과', '서울 영등포구', '서울특별시 영등포구 국제금융로 10', '02-2011-0002', ['내과', '신경과']),
  hospital('강서한강소아과', '서울 강서구', '서울특별시 강서구 화곡로 200', '02-2012-0001', ['소아청소년과', '내과']),
  hospital('김포공항응급클리닉', '서울 강서구', '서울특별시 강서구 공항대로 300', '02-2012-0002', ['응급의학과', '외과']),

  // 경기
  hospital('바른정형외과', '경기 성남시', '경기도 성남시 분당구 정자로 20', '031-3001-0001', ['정형외과', '재활의학과'], '정형외과 전문', OperationStatus.BREAK_TIME),
  hospital('분당서울대연계내과', '경기 성남시', '경기도 성남시 분당구 분당로 55', '031-3001-0002', ['내과', '가정의학과', '안과']),
  hospital('판교안과', '경기 성남시', '경기도 성남시 분당구 판교역로 10', '031-3001-0003', ['안과', '이비인후과']),
  hospital('수원푸른병원', '경기 수원시', '경기도 수원시 영통구 광교중앙로 120', '031-3002-0001', ['내과', '외과', '응급의학과', '정형외과']),
  hospital('수원산부인과', '경기 수원시', '경기도 수원시 팔달구 중부대로 200', '031-3002-0002', ['산부인과', '내과']),
  hospital('일산피부과', '경기 고양시', '경기도 고양시 일산동구 중앙로 100', '031-3003-0001', ['피부과', '내과']),
  hospital('고양소아과', '경기 고양시', '경기도 고양시 덕양구 화신로 50', '031-3003-0002', ['소아청소년과', '내과']),
  hospital('용인바른정형외과', '경기 용인시', '경기도 용인시 수지구 포은대로 80', '031-3004-0001', ['정형외과', '재활의학과']),
  hospital('기흥응급의료센터', '경기 용인시', '경기도 용인시 기흥구 동백중앙로 20', '031-3004-0002', ['응급의학과', '외과', '내과']),

  // 인천·부산·대구
  hospital('푸른소아과', '인천 연수구', '인천광역시 연수구 컨벤시아대로 5', '032-4001-0001', ['소아청소년과'], '소아청소년과', OperationStatus.OPEN, CongestionLevel.VERY_BUSY),
  hospital('인천송도내과', '인천 연수구', '인천광역시 연수구 송도과학로 30', '032-4001-0002', ['내과', '가정의학과', '이비인후과']),
  hospital('부산해운대안과', '부산 해운대구', '부산광역시 해운대구 해운대로 200', '051-5001-0001', ['안과', '내과']),
  hospital('부산서면내과', '부산 부산진구', '부산광역시 부산진구 중앙대로 500', '051-5002-0001', ['내과', '정형외과', '신경과']),
  hospital('부산응급의료원', '부산 남구', '부산광역시 남구 수영로 100', '051-5003-0001', ['응급의학과', '외과', '내과', '정형외과']),
  hospital('대구수성안과', '대구 수성구', '대구광역시 수성구 달구벌대로 300', '053-6001-0001', ['안과', '이비인후과']),
  hospital('대구동성로내과', '대구 중구', '대구광역시 중구 동성로 50', '053-6002-0001', ['내과', '가정의학과']),

  // 종합/다진료과
  hospital('강남종합병원', '서울 강남구', '서울특별시 강남구 강남대로 400', '02-2100-0001', [...STANDARD_DEPARTMENTS]),
  hospital('서울중앙메디컬센터', '서울 서초구', '서울특별시 서초구 반포대로 200', '02-2100-0002', ['내과', '외과', '정형외과', '신경과', '응급의학과', '소아청소년과']),
  hospital('수도권희망병원', '경기 성남시', '경기도 성남시 수정구 수정로 150', '031-3100-0001', ['내과', '외과', '산부인과', '소아청소년과', '응급의학과', '안과']),
];

async function resetHospitalData() {
  await prisma.reservation.deleteMany({});
  await prisma.hospitalDepartment.deleteMany({});
  await prisma.hospitalStatus.deleteMany({});
  await prisma.hospital.deleteMany({});
}

async function seedUsers() {
  const passwordHash = await bcrypt.hash('Admin1234!', 10);
  const userHash = await bcrypt.hash('User123456!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      name: '관리자',
      phone: '010-0000-0000',
      role: UserRole.ADMIN,
    },
  });

  const users: { id: number }[] = [admin];
  for (let i = 1; i <= 8; i++) {
    const u = await prisma.user.upsert({
      where: { email: `user${i}@example.com` },
      update: {},
      create: {
        email: `user${i}@example.com`,
        passwordHash: userHash,
        name: `테스트유저${i}`,
        phone: `010-100${i}-0000`,
        role: UserRole.USER,
      },
    });
    users.push(u);
  }
  return users;
}

async function seedHospitals() {
  const hospitals: { id: number; departments: string[] }[] = [];

  for (const hd of hospitalData) {
    const { departments, status, ...rest } = hd;
    const h = await prisma.hospital.create({
      data: {
        ...rest,
        bookingAvailable: status.operationStatus === OperationStatus.OPEN,
      },
    });
    await prisma.hospitalStatus.create({
      data: {
        hospitalId: h.id,
        ...status,
      },
    });
    for (const dn of departments) {
      await prisma.hospitalDepartment.create({
        data: { hospitalId: h.id, departmentName: dn, active: true },
      });
    }
    hospitals.push({ id: h.id, departments });
  }

  return hospitals;
}

async function seedReservations(
  hospitals: { id: number; departments: string[] }[],
  users: { id: number }[],
) {
  const days = [
    '2026-05-20',
    '2026-05-21',
    '2026-05-22',
    '2026-05-23',
    '2026-05-24',
    '2026-05-25',
    '2026-05-26',
  ];
  const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '15:00', '16:00', '16:30', '17:00'];
  const statuses = [
    ReservationStatus.BOOKED,
    ReservationStatus.CONFIRMED,
    ReservationStatus.COMPLETED,
    ReservationStatus.CANCELED,
  ];

  let created = 0;
  for (let i = 0; i < 120; i++) {
    const h = hospitals[i % hospitals.length];
    const dayStr = days[i % days.length];
    const time = times[i % times.length];
    const userId = users[1 + (i % (users.length - 1))].id;
    const day = new Date(`${dayStr}T00:00:00.000Z`);
    const deptName = h.departments[i % h.departments.length] ?? '내과';

    await prisma.reservation.create({
      data: {
        hospitalId: h.id,
        userId,
        patientName: `환자${i + 1}`,
        phone: `010-20${String(i + 1).padStart(2, '0')}-${String(1000 + i).slice(-4)}`,
        department: deptName,
        reservationDate: day,
        reservationTime: time,
        symptomSummary: '시드 더미 증상',
        memo: '시드 데이터',
        status: statuses[i % statuses.length],
        emergencyFlag: deptName === '응급의학과' && i % 5 === 0,
      },
    });
    created += 1;
  }
  return created;
}

async function main() {
  console.log('병원·예약 데이터 초기화 중...');
  await resetHospitalData();

  const users = await seedUsers();
  const hospitals = await seedHospitals();
  const reservationCount = await seedReservations(hospitals, users);

  const admin = users[0];
  await prisma.adminActionLog.create({
    data: {
      adminUserId: admin.id,
      targetType: 'SYSTEM',
      targetId: 0,
      actionType: 'SEED',
      beforeValue: '{}',
      afterValue: JSON.stringify({
        message: 'expanded seed',
        hospitalCount: hospitals.length,
        reservationCount,
      }),
    },
  });

  console.log(`Seed OK — 병원 ${hospitals.length}곳, 예약 ${reservationCount}건`);
  console.log('admin@example.com / Admin1234!  |  user1@example.com / User123456!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
