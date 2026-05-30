const BASE = '/api/v1';

export type LoginUser = {
  id: number;
  email: string;
  name: string;
  role: string;
};

export async function parseResponseBody<T extends Record<string, unknown>>(
  res: Response,
): Promise<T | null> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `서버 응답을 해석할 수 없습니다 (HTTP ${res.status}). API가 실행 중인지 확인하세요. (${trimmed.slice(0, 160)}${trimmed.length > 160 ? '…' : ''})`,
    );
  }
}

function messageFromPayload(data: { message?: string | string[] } | null, fallback: string): string {
  if (!data || data.message === undefined) {
    return fallback;
  }
  const m = data.message;
  return Array.isArray(m) ? m.join(', ') : m;
}

/** 관리자 웹 패널: 비밀번호만 (서버 ADMIN_PANEL_PASSWORD) */
export async function apiAdminLogin(password: string) {
  const res = await fetch(`${BASE}/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const data = await parseResponseBody<{
    accessToken?: string;
    user?: LoginUser;
    message?: string | string[];
  }>(res);

  if (!res.ok) {
    const msg = messageFromPayload(data ?? {}, `로그인 실패 (HTTP ${res.status})`);
    throw new Error(msg);
  }

  if (!data?.accessToken || !data?.user) {
    throw new Error('로그인 응답에 토큰 또는 사용자 정보가 없습니다. API 버전을 확인하세요.');
  }

  return { accessToken: data.accessToken, user: data.user };
}

export function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(token) });
  const data = await parseResponseBody<T & { message?: string | string[] }>(res);

  if (!res.ok) {
    const msg = messageFromPayload(
      (data ?? {}) as { message?: string | string[] },
      `요청 실패 (HTTP ${res.status})`,
    );
    throw new Error(msg);
  }

  if (data === null) {
    throw new Error('빈 응답을 받았습니다.');
  }

  return data as T;
}

export async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseResponseBody<T & { message?: string | string[] }>(res);

  if (!res.ok) {
    const msg = messageFromPayload(
      (data ?? {}) as { message?: string | string[] },
      `요청 실패 (HTTP ${res.status})`,
    );
    throw new Error(msg);
  }

  if (data === null) {
    throw new Error('빈 응답을 받았습니다.');
  }

  return data as T;
}

export async function apiPut<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await parseResponseBody<T & { message?: string | string[] }>(res);

  if (!res.ok) {
    const msg = messageFromPayload(
      (data ?? {}) as { message?: string | string[] },
      `요청 실패 (HTTP ${res.status})`,
    );
    throw new Error(msg);
  }

  if (data === null) {
    throw new Error('빈 응답을 받았습니다.');
  }

  return data as T;
}
