/**
 * MCP(stdio) 브릿지: REST API(/api/v1) 호출 결과를 { success, tool, data | error } 로 통일합니다.
 *
 * 환경변수: RESERVATION_API_BASE_URL, RESERVATION_JWT, RESERVATION_ADMIN_JWT
 * 실행: npm run mcp | npm run mcp:dev
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  TOOLS,
  formatReservationDisplayId,
  mapAppointmentStatus,
  mcpFailure,
  mcpSuccess,
  phoneDigits,
  throwIfNotOk,
  unwrapToolError,
} from './mcp-envelope';

const optionalToken = z.string().optional().describe('미지정 시 환경변수 RESERVATION_JWT / RESERVATION_ADMIN_JWT');

function resolveToken(override: string | undefined, admin: boolean): string | undefined {
  if (override !== undefined && override.length > 0) {
    return override;
  }
  if (admin) {
    return process.env.RESERVATION_ADMIN_JWT || process.env.RESERVATION_JWT;
  }
  return process.env.RESERVATION_JWT;
}

async function fetchApi(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string | undefined;
    admin?: boolean;
    noAuth?: boolean;
  } = {},
): Promise<unknown> {
  const base = (
    process.env.RESERVATION_API_BASE_URL ?? 'https://reservation.dmu.gosky.kr/api/v1'
  ).replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${p}`;
  const token = opts.noAuth ? undefined : resolveToken(opts.token, opts.admin ?? false);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  throwIfNotOk(res.status, data, typeof data === 'string' ? data : text);
  return data;
}

type HospitalListRow = {
  id: number;
  name: string;
  region: string;
  departments: string[];
};

async function buildSearchHospitalData(
  query: URLSearchParams,
  slotDate: string | undefined,
): Promise<
  Array<{
    hospital: string;
    department: string;
    location: string;
    availableSlots: string[];
  }>
> {
  const qs = query.toString();
  const raw = (await fetchApi(`/hospitals${qs ? `?${qs}` : ''}`, { noAuth: true })) as HospitalListRow[];

  const out: Array<{
    hospital: string;
    department: string;
    location: string;
    availableSlots: string[];
  }> = [];

  for (const h of raw) {
    let slotTimes: string[] = [];
    if (slotDate) {
      try {
        const slotRes = (await fetchApi(
          `/hospitals/${h.id}/available-slots?date=${encodeURIComponent(slotDate)}`,
          { noAuth: true },
        )) as { availableSlots?: string[] };
        slotTimes = slotRes.availableSlots ?? [];
      } catch {
        slotTimes = [];
      }
    }
    const slotsFormatted = slotTimes.map((t) => `${slotDate ?? ''} ${t}`.trim());
    const depts = h.departments?.length ? h.departments : [''];
    for (const dept of depts) {
      out.push({
        hospital: h.name,
        department: dept || '—',
        location: h.region,
        availableSlots: slotsFormatted,
      });
    }
  }
  return out;
}

async function main() {
  const mcpServer = new McpServer(
    { name: 'silverbridge-reservation', version: '0.2.0' },
    {
      instructions:
        '병원 예약 MCP. 응답은 항상 JSON { success, tool, data } 또는 { success, tool, error } 입니다. ' +
        '도구명은 고정: search_hospital, make_appointment 등. REST 서버가 실행 중이어야 합니다.',
    },
  );

  mcpServer.registerTool(
    TOOLS.signup,
    {
      description: '회원가입',
      inputSchema: {
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
        phone: z.string().describe('010-1234-5678 형식'),
      },
    },
    async (args) => {
      try {
        const data = await fetchApi('/auth/signup', { method: 'POST', body: args, noAuth: true });
        return mcpSuccess(TOOLS.signup, data);
      } catch (e) {
        return unwrapToolError(TOOLS.signup, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.login,
    {
      description: '로그인 (accessToken)',
      inputSchema: {
        email: z.string().email(),
        password: z.string().min(8),
      },
    },
    async (args) => {
      try {
        const data = await fetchApi('/auth/login', { method: 'POST', body: args, noAuth: true });
        return mcpSuccess(TOOLS.login, data);
      } catch (e) {
        return unwrapToolError(TOOLS.login, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.get_profile,
    {
      description: '내 프로필',
      inputSchema: { accessToken: optionalToken },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, false);
        if (!t) {
          return mcpFailure(TOOLS.get_profile, 'MISSING_ACCESS_TOKEN', 'RESERVATION_JWT 또는 accessToken이 필요합니다.');
        }
        const data = await fetchApi('/users/me', { token: t });
        return mcpSuccess(TOOLS.get_profile, data);
      } catch (e) {
        return unwrapToolError(TOOLS.get_profile, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.search_hospital,
    {
      description:
        '병원 검색. slot_date(YYYY-MM-DD)를 주면 해당 일자 예약 가능 시각을 "YYYY-MM-DD HH:mm" 형태로 채움.',
      inputSchema: {
        name: z.string().optional(),
        region: z.string().optional(),
        department: z.string().optional(),
        operationStatus: z.enum(['OPEN', 'CLOSED', 'BREAK_TIME', 'HOLIDAY', 'INSPECTION']).optional(),
        bookingAvailable: z.boolean().optional(),
        slot_date: z.string().optional().describe('슬롯 조회 날짜 YYYY-MM-DD'),
      },
    },
    async (args) => {
      try {
        const q = new URLSearchParams();
        if (args.name) {
          q.set('name', args.name);
        }
        if (args.region) {
          q.set('region', args.region);
        }
        if (args.department) {
          q.set('department', args.department);
        }
        if (args.operationStatus) {
          q.set('operationStatus', args.operationStatus);
        }
        if (args.bookingAvailable !== undefined) {
          q.set('bookingAvailable', String(args.bookingAvailable));
        }
        const data = await buildSearchHospitalData(q, args.slot_date);
        return mcpSuccess(TOOLS.search_hospital, data);
      } catch (e) {
        return unwrapToolError(TOOLS.search_hospital, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.get_hospital,
    {
      description: '병원 상세',
      inputSchema: { hospitalId: z.number().int().positive() },
    },
    async ({ hospitalId }) => {
      try {
        const data = await fetchApi(`/hospitals/${hospitalId}`, { noAuth: true });
        return mcpSuccess(TOOLS.get_hospital, data);
      } catch (e) {
        return unwrapToolError(TOOLS.get_hospital, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.get_hospital_status,
    {
      description: '병원 운영/혼잡',
      inputSchema: { hospitalId: z.number().int().positive() },
    },
    async ({ hospitalId }) => {
      try {
        const data = await fetchApi(`/hospitals/${hospitalId}/status`, { noAuth: true });
        return mcpSuccess(TOOLS.get_hospital_status, data);
      } catch (e) {
        return unwrapToolError(TOOLS.get_hospital_status, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.get_available_slots,
    {
      description: '예약 가능 슬롯',
      inputSchema: {
        hospitalId: z.number().int().positive(),
        date: z.string().describe('YYYY-MM-DD'),
      },
    },
    async ({ hospitalId, date }) => {
      try {
        const data = await fetchApi(`/hospitals/${hospitalId}/available-slots?date=${encodeURIComponent(date)}`, {
          noAuth: true,
        });
        return mcpSuccess(TOOLS.get_available_slots, data);
      } catch (e) {
        return unwrapToolError(TOOLS.get_available_slots, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.list_departments,
    {
      description: '병원 진료과 목록',
      inputSchema: { hospitalId: z.number().int().positive() },
    },
    async ({ hospitalId }) => {
      try {
        const data = await fetchApi(`/hospitals/${hospitalId}/departments`, { noAuth: true });
        return mcpSuccess(TOOLS.list_departments, data);
      } catch (e) {
        return unwrapToolError(TOOLS.list_departments, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.make_appointment,
    {
      description: '예약 생성 (필수: hospitalId, department, reservationDate, reservationTime, patientName, phone)',
      inputSchema: {
        accessToken: optionalToken,
        hospitalId: z.number().int(),
        department: z.string(),
        reservationDate: z.string(),
        reservationTime: z.string(),
        patientName: z.string(),
        phone: z.string(),
        birthDate: z.string().optional(),
        symptomSummary: z.string().optional(),
        memo: z.string().optional(),
        guardianName: z.string().optional(),
        guardianPhone: z.string().optional(),
        urgencyLevel: z.string().optional(),
        symptomSeverity: z.number().int().min(1).max(5).optional(),
        emergencyFlag: z.boolean().optional(),
      },
    },
    async (args) => {
      const tool = TOOLS.make_appointment;
      try {
        const nameOk = typeof args.patientName === 'string' && args.patientName.trim().length > 0;
        const phoneOk = typeof args.phone === 'string' && phoneDigits(args.phone).length >= 10;
        if (!nameOk || !phoneOk) {
          return mcpFailure(
            tool,
            'MISSING_REQUIRED_FIELD',
            '환자명과 연락처가 필요합니다.',
          );
        }

        const t = resolveToken(args.accessToken, false);
        if (!t) {
          return mcpFailure(tool, 'MISSING_ACCESS_TOKEN', 'RESERVATION_JWT 또는 accessToken이 필요합니다.');
        }

        const { accessToken, ...body } = args;
        const raw = (await fetchApi('/reservations', { method: 'POST', body, token: t })) as {
          reservationId: number;
          status: string;
          hospitalName: string;
          department: string;
          reservationDate: string;
          reservationTime: string;
          message?: string;
        };

        const data = {
          reservationId: formatReservationDisplayId(raw.reservationId, raw.reservationDate),
          reservation_id: raw.reservationId,
          hospital: raw.hospitalName,
          department: raw.department,
          date: raw.reservationDate,
          time: raw.reservationTime,
          patient_name: args.patientName.trim(),
          phone: phoneDigits(args.phone),
          status: mapAppointmentStatus(raw.status),
        };
        return mcpSuccess(tool, data);
      } catch (e) {
        return unwrapToolError(tool, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.list_my_appointments,
    {
      description: '내 예약 목록',
      inputSchema: { accessToken: optionalToken },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, false);
        if (!t) {
          return mcpFailure(TOOLS.list_my_appointments, 'MISSING_ACCESS_TOKEN', 'RESERVATION_JWT 또는 accessToken이 필요합니다.');
        }
        const rows = (await fetchApi('/reservations/my', { token: t })) as Array<{
          reservationId: number;
          hospitalName: string;
          department: string;
          reservationDate: string;
          reservationTime: string;
          status: string;
          symptomSummary: string;
          createdAt: string;
        }>;
        const data = rows.map((r) => ({
          reservationId: formatReservationDisplayId(r.reservationId, r.reservationDate),
          reservation_id: r.reservationId,
          hospital: r.hospitalName,
          department: r.department,
          date: r.reservationDate,
          time: r.reservationTime,
          status: mapAppointmentStatus(r.status),
          symptomSummary: r.symptomSummary,
          createdAt: r.createdAt,
        }));
        return mcpSuccess(TOOLS.list_my_appointments, data);
      } catch (e) {
        return unwrapToolError(TOOLS.list_my_appointments, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.get_appointment,
    {
      description: '예약 상세',
      inputSchema: {
        accessToken: optionalToken,
        reservationId: z.number().int().positive(),
      },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, false);
        if (!t) {
          return mcpFailure(TOOLS.get_appointment, 'MISSING_ACCESS_TOKEN', 'RESERVATION_JWT 또는 accessToken이 필요합니다.');
        }
        const raw = (await fetchApi(`/reservations/${args.reservationId}`, { token: t })) as {
          reservationId: number;
          hospitalName: string;
          department: string;
          reservationDate: string;
          reservationTime: string;
          status: string;
          patientName: string;
          phone: string;
          memo: string;
          symptomSummary: string;
          createdAt: string;
        };
        const data = {
          reservationId: formatReservationDisplayId(raw.reservationId, raw.reservationDate),
          reservation_id: raw.reservationId,
          hospital: raw.hospitalName,
          department: raw.department,
          date: raw.reservationDate,
          time: raw.reservationTime,
          patient_name: raw.patientName,
          phone: phoneDigits(raw.phone),
          status: mapAppointmentStatus(raw.status),
          memo: raw.memo,
          symptomSummary: raw.symptomSummary,
          createdAt: raw.createdAt,
        };
        return mcpSuccess(TOOLS.get_appointment, data);
      } catch (e) {
        return unwrapToolError(TOOLS.get_appointment, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.cancel_appointment,
    {
      description: '예약 취소',
      inputSchema: {
        accessToken: optionalToken,
        reservationId: z.number().int().positive(),
      },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, false);
        if (!t) {
          return mcpFailure(TOOLS.cancel_appointment, 'MISSING_ACCESS_TOKEN', 'RESERVATION_JWT 또는 accessToken이 필요합니다.');
        }
        const raw = (await fetchApi(`/reservations/${args.reservationId}/cancel`, {
          method: 'PATCH',
          token: t,
        })) as { reservationId: number; status: string; message?: string };
        return mcpSuccess(TOOLS.cancel_appointment, {
          reservation_id: raw.reservationId,
          status: mapAppointmentStatus(raw.status),
          message: raw.message ?? '',
        });
      } catch (e) {
        return unwrapToolError(TOOLS.cancel_appointment, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_hospitals_list,
    {
      description: '[관리자] 병원 목록',
      inputSchema: { accessToken: optionalToken },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_hospitals_list, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const data = await fetchApi('/admin/hospitals', { token: t, admin: true });
        return mcpSuccess(TOOLS.admin_hospitals_list, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_hospitals_list, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_dashboard,
    {
      description: '[관리자] 대시보드',
      inputSchema: { accessToken: optionalToken },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_dashboard, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const data = await fetchApi('/admin/dashboard', { token: t, admin: true });
        return mcpSuccess(TOOLS.admin_dashboard, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_dashboard, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_reservations_list,
    {
      description: '[관리자] 예약 목록',
      inputSchema: {
        accessToken: optionalToken,
        hospitalId: z.number().int().optional(),
        date: z.string().optional(),
        status: z
          .enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'REJECTED'])
          .optional(),
      },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_reservations_list, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const q = new URLSearchParams();
        if (args.hospitalId !== undefined) {
          q.set('hospitalId', String(args.hospitalId));
        }
        if (args.date) {
          q.set('date', args.date);
        }
        if (args.status) {
          q.set('status', args.status);
        }
        const qs = q.toString();
        const data = await fetchApi(`/admin/reservations${qs ? `?${qs}` : ''}`, { token: t, admin: true });
        return mcpSuccess(TOOLS.admin_reservations_list, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_reservations_list, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_reservation_update_status,
    {
      description: '[관리자] 예약 상태 변경',
      inputSchema: {
        accessToken: optionalToken,
        reservationId: z.number().int().positive(),
        status: z.enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'REJECTED']),
        memo: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_reservation_update_status, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const { accessToken, reservationId, ...payload } = args;
        const data = await fetchApi(`/admin/reservations/${reservationId}/status`, {
          method: 'PUT',
          body: payload,
          token: t,
          admin: true,
        });
        return mcpSuccess(TOOLS.admin_reservation_update_status, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_reservation_update_status, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_hospital_update_status,
    {
      description: '[관리자] 병원 운영/혼잡 상태',
      inputSchema: {
        accessToken: optionalToken,
        hospitalId: z.number().int().positive(),
        operationStatus: z.enum(['OPEN', 'CLOSED', 'BREAK_TIME', 'HOLIDAY', 'INSPECTION']).optional(),
        congestionLevel: z.enum(['LOW', 'NORMAL', 'BUSY', 'VERY_BUSY']).optional(),
        waitingCount: z.number().int().min(0).optional(),
        averageWaitingMinutes: z.number().int().min(0).optional(),
        todayReservationCount: z.number().int().min(0).optional(),
        acceptingPatients: z.boolean().optional(),
        notice: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_hospital_update_status, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const { accessToken, hospitalId, ...rest } = args;
        const body = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
        const data = await fetchApi(`/admin/hospitals/${hospitalId}/status`, {
          method: 'PUT',
          body,
          token: t,
          admin: true,
        });
        return mcpSuccess(TOOLS.admin_hospital_update_status, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_hospital_update_status, e);
      }
    },
  );

  mcpServer.registerTool(
    TOOLS.admin_action_logs,
    {
      description: '[관리자] 변경 로그',
      inputSchema: { accessToken: optionalToken },
    },
    async (args) => {
      try {
        const t = resolveToken(args.accessToken, true);
        if (!t) {
          return mcpFailure(TOOLS.admin_action_logs, 'MISSING_ACCESS_TOKEN', 'RESERVATION_ADMIN_JWT 또는 accessToken(관리자)이 필요합니다.');
        }
        const data = await fetchApi('/admin/action-logs', { token: t, admin: true });
        return mcpSuccess(TOOLS.admin_action_logs, data);
      } catch (e) {
        return unwrapToolError(TOOLS.admin_action_logs, e);
      }
    },
  );

  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
