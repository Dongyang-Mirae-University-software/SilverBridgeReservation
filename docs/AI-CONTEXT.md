# SilverBridge Reservation — AI 에이전트 참고

이 파일은 코딩 에이전트·LLM이 저장소 맥락을 빠르게 잡도록 요약한 것이다. **상세 요구사항은 반드시 아래 “정본”을 따른다.**

## 정본(요구사항)

- `reservation.md` — 병원 예약 API·도메인·엔드포인트·비기능 요구 전체

## 이 프로젝트가 하는 일

- NestJS REST API (`/api/v1`) + Prisma(SQLite 기본) + JWT
- 관리자 웹: `admin-ui/` (Vite React), 패널 로그인은 `POST /auth/admin-login` (비밀번호만, `ADMIN_PANEL_PASSWORD`)
- MCP 브릿지: `src/mcp/reservation-mcp.ts` — REST를 호출하며 응답은 `src/mcp/mcp-envelope.ts` 형식 (`success`, `tool`, `data` | `error`)

## 실행·포트

- API: `pnpm start:dev` — 포트는 루트 `.env`의 `PORT` (기본 6015)
- 관리자 UI: `pnpm admin:dev` — 보통 `http://localhost:5173`, API로는 Vite 프록시가 **상위 폴더 `.env`의 `PORT`** 를 읽어 연결
- Swagger: `http://localhost:<PORT>/docs`

## 환경 변수(루트 `.env`)

- `DATABASE_URL`, `JWT_SECRET`, `PORT`
- `ADMIN_PANEL_PASSWORD` — 관리자 패널 비밀번호 (미설정 시 코드 기본 `admin1234`)
- MCP용: `RESERVATION_API_BASE_URL`, `RESERVATION_JWT`, `RESERVATION_ADMIN_JWT` (`.env.example` 참고)

## MCP 도구 이름(오타 금지)

- 상수: `src/mcp/mcp-envelope.ts` 의 `TOOLS`
- 예: `search_hospital`, `make_appointment`, `login`, `admin_dashboard`, …

## 금지·주의

- 예약 도메인은 더미이나, 실제 EMR과 혼동되는 문구를 코드에 남기지 말 것(`reservation.md` 주의사항).
- 관리자 API는 `ADMIN` JWT 필수. 일반 사용자 토큰으로 호출 불가.

## Cursor에서 고정으로 읽히게 하려면

- 프로젝트 루트에 `.cursor/rules` 규칙을 두거나, 채팅에서 `@docs/AI-CONTEXT.md` 또는 `@reservation.md` 로 참조한다.
