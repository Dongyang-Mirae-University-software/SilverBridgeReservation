/**
 * 기본값 없이 반드시 설정해야 하는 비밀값. 비어 있으면 기동을 실패시킨다.
 * 코드·compose에 기본값을 두면 저장소를 보는 누구나 토큰 서명키·관리자 비밀번호를 알게 된다.
 */
export const REQUIRED_SECRETS = ['JWT_SECRET', 'ADMIN_PANEL_PASSWORD'] as const;

export function assertRequiredSecrets(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_SECRETS.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`필수 환경변수가 비어 있습니다: ${missing.join(', ')} (기본값 없음)`);
  }
}
