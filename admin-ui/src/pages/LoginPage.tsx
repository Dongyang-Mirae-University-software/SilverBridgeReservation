import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { login } = useAuth();
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(password);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>관리자 로그인</h1>
        <p>패널 비밀번호만 입력하세요. (서버 환경변수 ADMIN_PANEL_PASSWORD)</p>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>
          {err ? <p className="error">{err}</p> : null}
          <button type="submit" className="btn" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? '확인 중…' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
