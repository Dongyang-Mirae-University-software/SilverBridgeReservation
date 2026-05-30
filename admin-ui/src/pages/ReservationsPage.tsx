import { useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGet } from '../api';

type ReservationRow = {
  reservationId: number;
  hospitalName: string;
  patientName: string;
  department: string;
  reservationDate: string;
  reservationTime: string;
  status: string;
  phone: string;
};

export default function ReservationsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await apiGet<ReservationRow[]>('/admin/reservations', token);
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
        <h2>예약 목록</h2>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>번호</th>
              <th>병원</th>
              <th>환자</th>
              <th>진료과</th>
              <th>일시</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reservationId}>
                <td>{r.reservationId}</td>
                <td>{r.hospitalName}</td>
                <td>{r.patientName}</td>
                <td>{r.department}</td>
                <td>
                  {r.reservationDate} {r.reservationTime}
                </td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
