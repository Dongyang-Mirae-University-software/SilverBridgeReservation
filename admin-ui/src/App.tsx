import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import HospitalsPage from './pages/HospitalsPage';
import ReservationsPage from './pages/ReservationsPage';
import LogsPage from './pages/LogsPage';
import UsersPage from './pages/UsersPage';

function ProtectedLayout() {
  const { token, user, logout } = useAuth();

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>병원 예약 관리</h1>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          대시보드
        </NavLink>
        <NavLink to="/hospitals" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          병원
        </NavLink>
        <NavLink to="/reservations" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          예약
        </NavLink>
        <NavLink to="/users" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          회원 관리
        </NavLink>
        <NavLink to="/logs" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          변경 로그
        </NavLink>
        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: '1.5rem' }} onClick={logout}>
          로그아웃
        </button>
        <p className="muted" style={{ padding: '0 1.25rem', marginTop: '1rem' }}>
          {user.email}
        </p>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  const { token, user } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={token && user?.role === 'ADMIN' ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route path="/" element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="hospitals" element={<HospitalsPage />} />
        <Route path="reservations" element={<ReservationsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="logs" element={<LogsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
