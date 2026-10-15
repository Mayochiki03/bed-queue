/**
 * lib/session.tsx — ข้อมูลผู้ใช้ที่ล็อกอิน + ข้อมูลระบบ (ชื่อ/ธีม)
 *   const { user, login, logout } = useSession();
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, onSessionExpired, type ApiResult } from '../api/client';

export type Role = 'STAFF' | 'ADMIN' | 'DEV';
const RANK: Record<Role, number> = { STAFF: 1, ADMIN: 2, DEV: 3 };
export const ROLE_LABEL: Record<Role, string> = { STAFF: 'เจ้าหน้าที่จัดคิว', ADMIN: 'ผู้ดูแล', DEV: 'นักพัฒนา' };
/** role นี้มีสิทธิ์ถึงระดับ min ไหม (STAFF < ADMIN < DEV) */
export const hasRole = (role: Role | undefined, min: Role) => !!role && RANK[role] >= RANK[min];
export type User = { id: number; username: string; full_name: string; role: Role; /** ผูกแอปยืนยันตัวตน 2 ชั้นแล้วหรือยัง (จาก /auth/me) */ mfa_enabled?: boolean };
/** ผลของ /auth/login: ได้ user เลย หรือ mfa = ต้องผ่านขั้นยืนยันตัวตน 2 ชั้นต่อ (setup = ผูกแอปครั้งแรก, verify = กรอกรหัส) */
export type LoginData = { user: User | { full_name: string; username: string }; mfa: 'setup' | 'verify' | null };
export type PendingMfa = { stage: 'setup' | 'verify'; who: { full_name: string; username: string } };
type AppInfo = { name: string; theme: string };

type Session = {
  ready: boolean;
  app: AppInfo;
  user: User | null;
  login: (username: string, password: string) => Promise<ApiResult<LoginData>>;
  logout: () => Promise<void>;
  /** ขั้นยืนยันตัวตน 2 ชั้นที่รออยู่ (null = ไม่มี) */
  pendingMfa: PendingMfa | null;
  /** ผ่าน 2FA แล้ว → เข้าสู่ระบบ */
  finishMfa: (user: User) => void;
  /** ยกเลิกขั้น 2FA กลับหน้ากรอกรหัสผ่าน */
  cancelMfa: () => void;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [app, setApp] = useState<AppInfo>({ name: 'ระบบคิวขอเตียง', theme: 'herb' });
  const [user, setUser] = useState<User | null>(null);
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);

  useEffect(() => {
    void (async () => {
      const info = await api.get<AppInfo>('/app');
      if (info.data) setApp(info.data);
      const me = await api.get<User>('/auth/me');
      setUser(me.ok ? me.data : null);
      setReady(true);
    })();
  }, []);

  // ธีมและชื่อแท็บ ตั้งจากค่าใน .env (APP_THEME / APP_NAME)
  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
    document.title = app.name;
  }, [app]);

  useEffect(() => onSessionExpired(() => setUser(null)), []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginData>('/auth/login', { username, password });
    if (res.ok && res.data) {
      if (res.data.mfa) setPendingMfa({ stage: res.data.mfa, who: res.data.user });
      else setUser(res.data.user as User);
    }
    return res;
  }, []);

  const finishMfa = useCallback((u: User) => {
    setPendingMfa(null);
    setUser(u);
  }, []);
  const cancelMfa = useCallback(() => setPendingMfa(null), []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
    setPendingMfa(null);
  }, []);

  const value = useMemo(() => ({ ready, app, user, login, logout, pendingMfa, finishMfa, cancelMfa }), [ready, app, user, login, logout, pendingMfa, finishMfa, cancelMfa]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession ต้องใช้ภายใน <SessionProvider>');
  return ctx;
}
