import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { apiGet, apiPost, apiPut } from '../api';

type UserRow = {
  id: number;
  email: string;
  name: string;
  phone: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
  reservationCount: number;
  adminLogCount: number;
};

type CreateUserForm = {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'USER' | 'ADMIN';
};

type UserDraft = {
  name: string;
  phone: string;
  role: 'USER' | 'ADMIN';
  password: string;
};

const emptyCreateForm = (): CreateUserForm => ({
  email: '',
  password: '',
  name: '',
  phone: '',
  role: 'USER',
});

export default function UsersPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, UserDraft>>({});
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);

  const loadUsers = useCallback(
    async (q: string) => {
      if (!token) {
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const path = q.trim() ? `/admin/users?q=${encodeURIComponent(q.trim())}` : '/admin/users';
        const list = await apiGet<UserRow[]>(path, token);
        setRows(list);
        setDrafts(
          Object.fromEntries(
            list.map((user) => [
              user.id,
              {
                name: user.name,
                phone: user.phone,
                role: user.role,
                password: '',
              },
            ]),
          ),
        );
      } catch (e) {
        setErr(e instanceof Error ? e.message : '불러오기 실패');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadUsers(query);
  }, [token, loadUsers, query]);

  function handleSearch() {
    setQuery(searchText);
  }

  async function handleCreate() {
    if (!token) {
      return;
    }
    setCreating(true);
    setErr(null);
    setMessage(null);
    try {
      await apiPost<UserRow>('/admin/users', token, createForm);
      setMessage('회원이 등록되었습니다.');
      setCreateForm(emptyCreateForm());
      await loadUsers(query);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(row: UserRow) {
    if (!token) {
      return;
    }
    const draft = drafts[row.id];
    if (!draft) {
      return;
    }
    setErr(null);
    setMessage(null);
    try {
      const payload: Record<string, string> = {
        name: draft.name,
        phone: draft.phone,
        role: draft.role,
      };
      if (draft.password.trim()) {
        payload.password = draft.password.trim();
      }
      const updated = await apiPut<UserRow>(`/admin/users/${row.id}`, token, payload);
      setRows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setDrafts((prev) => ({
        ...prev,
        [updated.id]: {
          name: updated.name,
          phone: updated.phone,
          role: updated.role,
          password: '',
        },
      }));
      setMessage(`회원 ${updated.email} 정보가 저장되었습니다.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '저장 실패');
    }
  }

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
        <h2>회원 관리</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="이메일 / 이름 / 전화번호 검색"
            style={{ minWidth: '280px' }}
          />
          <button type="button" className="btn" onClick={handleSearch}>
            검색
          </button>
        </div>
      </div>

      {message ? (
        <div className="card">
          <p style={{ margin: 0 }}>{message}</p>
        </div>
      ) : null}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>회원 등록</h3>
        <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          <input
            value={createForm.email}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="이메일"
          />
          <input
            value={createForm.password}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="비밀번호"
            type="password"
          />
          <input
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="이름"
          />
          <input
            value={createForm.phone}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="전화번호"
          />
          <select
            value={createForm.role}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as CreateUserForm['role'] }))}
          >
            <option value="USER">USER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn" onClick={handleCreate} disabled={creating}>
            {creating ? '등록 중…' : '회원 등록'}
          </button>
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>회원 목록</h3>
        {loading ? <p className="muted">불러오는 중…</p> : null}
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>이메일</th>
              <th>이름</th>
              <th>전화번호</th>
              <th>권한</th>
              <th>예약</th>
              <th>로그</th>
              <th>수정</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const draft = drafts[row.id] ?? {
                name: row.name,
                phone: row.phone,
                role: row.role,
                password: '',
              };
              return (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.email}</td>
                  <td>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, name: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      value={draft.phone}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, phone: e.target.value },
                        }))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={draft.role}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [row.id]: { ...draft, role: e.target.value as UserDraft['role'] },
                        }))
                      }
                    >
                      <option value="USER">USER</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </td>
                  <td>{row.reservationCount}</td>
                  <td>{row.adminLogCount}</td>
                  <td>
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      <input
                        value={draft.password}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [row.id]: { ...draft, password: e.target.value },
                          }))
                        }
                        placeholder="비밀번호 재설정"
                        type="password"
                      />
                      <button type="button" className="btn" onClick={() => void handleSave(row)}>
                        저장
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
