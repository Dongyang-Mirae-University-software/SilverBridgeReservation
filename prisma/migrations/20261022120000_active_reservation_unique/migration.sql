-- 활성(BOOKED·CONFIRMED) 예약만 겹치지 못하게 하는 부분 유니크 인덱스.
-- 서비스 코드의 findFirst 중복 검사는 검사와 INSERT 사이에 다른 요청이 끼면 둘 다 통과하므로, DB 가 최후 방어선이 된다.
-- 취소·완료·거절 등 비활성 상태는 제외라 같은 시간대를 다시 예약할 수 있다.
-- Prisma 스키마로는 부분 인덱스를 표현할 수 없어 SQL 로만 관리한다(schema.prisma 의 Reservation 주석 참고).
-- 롤백: DROP INDEX "Reservation_active_user_slot_key"; DROP INDEX "Reservation_active_hospital_slot_key";

-- 같은 사용자의 같은 날짜·시간 (병원이 달라도 한 사람이 동시에 두 곳에 갈 수 없다)
CREATE UNIQUE INDEX "Reservation_active_user_slot_key"
    ON "Reservation"("userId", "reservationDate", "reservationTime")
    WHERE "status" IN ('BOOKED', 'CONFIRMED');

-- 같은 병원의 같은 날짜·시간 (병원 슬롯은 한 건)
CREATE UNIQUE INDEX "Reservation_active_hospital_slot_key"
    ON "Reservation"("hospitalId", "reservationDate", "reservationTime")
    WHERE "status" IN ('BOOKED', 'CONFIRMED');
