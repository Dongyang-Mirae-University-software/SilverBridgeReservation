-- 병원 점심시간·휴진 요일(2026-10-28). 추가만 하는 마이그레이션 - 기존 행은 점심시간 없음·휴진 요일 없음(지금과 같은 동작).
-- closedWeekdays: 쉼표로 구분한 요일 번호(0=일 … 6=토), 빈 문자열이면 휴진 없음. SQLite 라 배열 대신 문자열로 둔다.
-- 롤백: ALTER TABLE "Hospital" DROP COLUMN "breakStart"; ALTER TABLE "Hospital" DROP COLUMN "breakEnd"; ALTER TABLE "Hospital" DROP COLUMN "closedWeekdays";
ALTER TABLE "Hospital" ADD COLUMN "breakStart" TEXT;
ALTER TABLE "Hospital" ADD COLUMN "breakEnd" TEXT;
ALTER TABLE "Hospital" ADD COLUMN "closedWeekdays" TEXT NOT NULL DEFAULT '';
