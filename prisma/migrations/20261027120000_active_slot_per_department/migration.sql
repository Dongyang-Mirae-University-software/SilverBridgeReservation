-- 병원 시간 칸을 진료과마다 따로 둔다(R-6). 예전 인덱스는 (병원, 날짜, 시간)이라 내과 10시가 차면 같은 병원 안과 10시도 마감됐다.
-- 새 인덱스는 예전보다 조건이 느슨해(진료과가 더해짐) 기존 데이터로는 실패하지 않는다.
-- 사용자 기준 인덱스(Reservation_active_user_slot_key - 한 사람은 같은 시간에 한 곳만)는 그대로 둔다.
-- Prisma 스키마로는 부분 인덱스를 표현할 수 없어 SQL 로만 관리한다(schema.prisma 의 Reservation 주석 참고).
-- 롤백: DROP INDEX "Reservation_active_hospital_dept_slot_key";
--       CREATE UNIQUE INDEX "Reservation_active_hospital_slot_key" ON "Reservation"("hospitalId", "reservationDate", "reservationTime") WHERE "status" IN ('BOOKED', 'CONFIRMED');
--       (진료과만 다른 같은 시간 활성 예약이 생긴 뒤에는 두 번째 문장이 실패한다 - 그 예약부터 정리할 것)

DROP INDEX "Reservation_active_hospital_slot_key";

-- 같은 병원·진료과의 같은 날짜·시간 (진료과 시간 칸은 한 건)
CREATE UNIQUE INDEX "Reservation_active_hospital_dept_slot_key"
    ON "Reservation"("hospitalId", "department", "reservationDate", "reservationTime")
    WHERE "status" IN ('BOOKED', 'CONFIRMED');
