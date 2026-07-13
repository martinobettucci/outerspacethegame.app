/**
 * État applicatif minimal : session joueur + vue courante.
 * Pas de bibliothèque d'état : la surface est petite et explicite (§19 —
 * pas de dépendance sans nécessité).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, type Me } from './api.js';

export type View =
  | { kind: 'galaxy' }
  | { kind: 'planet'; planetId: string }
  | { kind: 'comms' }
  | { kind: 'market' };

interface AppState {
  me: Me | null;
  authChecked: boolean;
  view: View;
  setView: (v: View) => void;
  refreshMe: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [view, setView] = useState<View>({ kind: 'galaxy' });

  const refreshMe = useCallback(async () => {
    try {
      setMe(await api.me());
    } catch {
      setMe(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    await api.logout();
    setMe(null);
    setView({ kind: 'galaxy' });
  }, []);

  const value = useMemo(
    () => ({ me, authChecked, view, setView, refreshMe, logout }),
    [me, authChecked, view, refreshMe, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppState hors AppStateProvider');
  return ctx;
}
