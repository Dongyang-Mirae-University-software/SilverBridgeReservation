import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGet } from '../api';

type LogRow = {
  id: number;
  targetType: string;
  targetId: number;
  actionType: string;
  beforeValue: string;
  afterValue: string;
  createdAt: string;
  admin?: { email: string; name: string };
};

export default function LogsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<LogRow[]>('/admin/action-logs', token);
        if (!cancelled) {
          setRows(list);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : '불러오기 실패');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (err) {
    return (
      <div className="card">
        <p className="error">{err}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <h2>관리자 변경 로그</h2>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>시각</th>
              <th>관리자</th>
              <th>대상</th>
              <th>동작</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(r.createdAt).toLocaleString('ko-KR')}</td>
                <td>{r.admin?.email ?? '—'}</td>
                <td>
                  {r.targetType} #{r.targetId}
                </td>
                <td>{r.actionType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
