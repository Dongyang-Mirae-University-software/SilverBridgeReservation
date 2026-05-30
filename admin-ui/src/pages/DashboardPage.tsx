import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGet } from '../api';

type Dashboard = {
  date: string;
  todayReservationTotal: number;
  reservationsByHospital: { hospitalId: number; hospitalName: string; count: number }[];
  reservationsByStatus: Record<string, number>;
  congestionDistribution: Record<string, number>;
  operationStatusDistribution: Record<string, number>;
};

export default function DashboardPage() {
  const { token } = useAuth();
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await apiGet<Dashboard>('/admin/dashboard', token);
        if (!cancelled) {
          setData(d);
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

  if (!data) {
    return <p className="muted">불러오는 중…</p>;
  }

  return (
    <div>
      <div className="topbar">
        <h2>대시보드</h2>
        <span className="muted">기준일: {data.date}</span>
      </div>

      <div className="grid-stats">
        <div className="stat">
          <div className="label">오늘 예약 건수</div>
          <div className="value">{data.todayReservationTotal}</div>
        </div>
      </div>

      <div className="card">
        <h2>병원별 오늘 예약</h2>
        <table>
          <thead>
            <tr>
              <th>병원</th>
              <th>건수</th>
            </tr>
          </thead>
          <tbody>
            {data.reservationsByHospital.map((r) => (
              <tr key={r.hospitalId}>
                <td>{r.hospitalName}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>예약 상태별</h2>
        <pre style={{ margin: 0, overflow: 'auto', fontSize: '0.85rem' }}>{JSON.stringify(data.reservationsByStatus, null, 2)}</pre>
      </div>

      <div className="card">
        <h2>혼잡도 / 운영 상태</h2>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          혼잡도
        </p>
        <pre style={{ margin: '0 0 1rem', overflow: 'auto', fontSize: '0.85rem' }}>
          {JSON.stringify(data.congestionDistribution, null, 2)}
        </pre>
        <p className="muted" style={{ marginBottom: '0.5rem' }}>
          운영
        </p>
        <pre style={{ margin: 0, overflow: 'auto', fontSize: '0.85rem' }}>
          {JSON.stringify(data.operationStatusDistribution, null, 2)}
        </pre>
      </div>
    </div>
  );
}
