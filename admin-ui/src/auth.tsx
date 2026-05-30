import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiAdminLogin, type LoginUser } from './api';

const STORAGE = 'sb_reservation_admin_token';
const USER_STORAGE = 'sb_reservation_admin_user';

type AuthState = {
  token: string | null;
  user: LoginUser | null;
};

type AuthContextValue = AuthState & {
  login: (password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadInitial(): AuthState {
  try {
    const token = localStorage.getItem(STORAGE);
    const raw = localStorage.getItem(USER_STORAGE);
    const user = raw ? (JSON.parse(raw) as LoginUser) : null;
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadInitial);

  const login = useCallback(async (password: string) => {
    const { accessToken, user } = await apiAdminLogin(password);
    if (user.role !== 'ADMIN') {
      throw new Error('관리자만 접속할 수 있습니다.');
    }
    localStorage.setItem(STORAGE, accessToken);
    localStorage.setItem(USER_STORAGE, JSON.stringify(user));
    setState({ token: accessToken, user });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE);
    localStorage.removeItem(USER_STORAGE);
    setState({ token: null, user: null });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('AuthProvider 필요');
  }
  return ctx;
}
