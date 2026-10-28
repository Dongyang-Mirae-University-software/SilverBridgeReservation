-- 병원 요일별 진료 시간(2026-10-28, 예: 토요일 반일). 추가만 하는 마이그레이션 - 기존 행은 빈 문자열 = 모든 요일 기본 진료 시간.
-- weekdayHours: JSON 배열 문자열 [{"weekday":6,"openTime":"09:00","closeTime":"13:00"}] - 그 요일만 기본 진료 시간을 덮어쓴다.
-- 롤백: ALTER TABLE "Hospital" DROP COLUMN "weekdayHours";
ALTER TABLE "Hospital" ADD COLUMN "weekdayHours" TEXT NOT NULL DEFAULT '';
