import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGet } from '../api';

type HospitalRow = {
  id: number;
  name: string;
  region: string;
  address: string;
  phone: string;
  bookingAvailable: boolean;
  deleted: boolean;
  status?: { operationStatus: string; congestionLevel: string };
  departments?: { departmentName: string; active: boolean }[];
};

export default function HospitalsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<HospitalRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<HospitalRow[]>('/admin/hospitals', token);
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
        <h2>병원 목록</h2>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이름</th>
              <th>지역</th>
              <th>예약</th>
              <th>운영</th>
              <th>혼잡</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.id}>
                <td>{h.id}</td>
                <td>{h.name}</td>
                <td>{h.region}</td>
                <td>{h.bookingAvailable ? '가능' : '불가'}</td>
                <td>{h.status?.operationStatus ?? '—'}</td>
                <td>{h.status?.congestionLevel ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
