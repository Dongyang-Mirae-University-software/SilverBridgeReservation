/**
 * MCP 도구 응답 공통 포맷 (ChatAI / 오케스트레이터와 동일 구조 유지)
 */
export const TOOLS = {
  signup: 'signup',
  login: 'login',
  get_profile: 'get_profile',
  search_hospital: 'search_hospital',
  get_hospital: 'get_hospital',
  get_hospital_status: 'get_hospital_status',
  get_available_slots: 'get_available_slots',
  list_departments: 'list_departments',
  make_appointment: 'make_appointment',
  list_my_appointments: 'list_my_appointments',
  get_appointment: 'get_appointment',
  cancel_appointment: 'cancel_appointment',
  admin_hospitals_list: 'admin_hospitals_list',
  admin_dashboard: 'admin_dashboard',
  admin_reservations_list: 'admin_reservations_list',
  admin_reservation_update_status: 'admin_reservation_update_status',
  admin_hospital_update_status: 'admin_hospital_update_status',
  admin_action_logs: 'admin_action_logs',
} as const;

export type ToolName = (typeof TOOLS)[keyof typeof TOOLS];

export type McpSuccessPayload<T = unknown> = {
  success: true;
  tool: string;
  data: T;
};

export type McpErrorPayload = {
  success: false;
  tool: string;
  error: {
    code: string;
    message: string;
  };
};

export function mcpTextResult(payload: McpSuccessPayload | McpErrorPayload) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    isError: !payload.success,
  };
}

export function mcpSuccess<T>(tool: string, data: T): ReturnType<typeof mcpTextResult> {
  const payload: McpSuccessPayload<T> = { success: true, tool, data };
  return mcpTextResult(payload);
}

export function mcpFailure(tool: string, code: string, message: string): ReturnType<typeof mcpTextResult> {
  const payload: McpErrorPayload = {
    success: false,
    tool,
    error: { code, message },
  };
  return mcpTextResult(payload);
}

export class UpstreamHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UpstreamHttpError';
  }
}

function httpStatusToCode(status: number): string {
  if (status === 400) {
    return 'BAD_REQUEST';
  }
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 409) {
    return 'CONFLICT';
  }
  if (status >= 500) {
    return 'UPSTREAM_ERROR';
  }
  return 'REQUEST_FAILED';
}

/** REST 오류 본문에서 code/message 추출 후 예외 */
export function throwIfNotOk(
  status: number,
  body: unknown,
  rawText: string,
): void {
  if (status >= 200 && status < 300) {
    return;
  }
  let code = httpStatusToCode(status);
  let message = rawText || `HTTP ${status}`;
  if (typeof body === 'object' && body !== null) {
    const o = body as Record<string, unknown>;
    if (typeof o.code === 'string') {
      code = o.code;
    }
    if (typeof o.message === 'string') {
      message = o.message;
    } else if (Array.isArray(o.message)) {
      message = o.message.map(String).join(', ');
    }
  }
  throw new UpstreamHttpError(status, code, message);
}

export function unwrapToolError(tool: string, e: unknown): ReturnType<typeof mcpTextResult> {
  if (e instanceof UpstreamHttpError) {
    return mcpFailure(tool, e.code, e.message);
  }
  if (e instanceof Error) {
    if (e.message.startsWith('fetch failed') || e.message.includes('ECONNREFUSED')) {
      return mcpFailure(tool, 'UPSTREAM_UNREACHABLE', '예약 API 서버에 연결할 수 없습니다.');
    }
    return mcpFailure(tool, 'INTERNAL_ERROR', e.message);
  }
  return mcpFailure(tool, 'INTERNAL_ERROR', String(e));
}

export function formatReservationDisplayId(reservationId: number, dateYmd: string): string {
  const compact = dateYmd.replace(/-/g, '');
  return `R-${compact}-${String(reservationId).padStart(4, '0')}`;
}

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** API ReservationStatus → 소문자 사용자용 상태 */
export function mapAppointmentStatus(api: string): string {
  const m: Record<string, string> = {
    BOOKED: 'booked',
    CONFIRMED: 'confirmed',
    COMPLETED: 'completed',
    CANCELED: 'canceled',
    NO_SHOW: 'no_show',
    REJECTED: 'rejected',
  };
  return m[api] ?? api.toLowerCase();
}
