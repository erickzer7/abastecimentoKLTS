import { createContext, useContext, useState, ReactNode } from 'react';
import type { Operador } from '../lib/types';

interface AuthCtx {
  operador: Operador | null;
  login: (op: Operador) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const STORAGE_KEY = 'klt.operador';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [operador, setOperador] = useState<Operador | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Operador) : null;
    } catch { return null; }
  });

  const login = (op: Operador) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(op)); } catch {}
    setOperador(op);
  };

  const logout = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setOperador(null);
  };

  return <Ctx.Provider value={{ operador, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth usado fora de AuthProvider');
  return ctx;
}
