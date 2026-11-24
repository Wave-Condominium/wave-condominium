'use client';

// ---------------------------------------------------------------------------
// src/contexts/AlertasSegurancaContext.tsx
//
// Estado compartilhado dos alertas de segurança (SEG-016 Fase 2). Mesmo
// padrão do PendenciasContext (SÍN-026): une o CONTADOR do menu lateral e a
// lista consultada na página, para que resolver um alerta atualize o
// contador na hora.
//
// Só carrega para quem pode consultar eventos de segurança (Admin, Síndico,
// Administradora — mesmo escopo de resolverEscopoConsulta). A autorização
// real é do servidor; aqui só evitamos a chamada para quem nunca teria acesso.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';
import { contarAlertasAbertosAction, resolverAlertaAction } from '@/app/actions/alertasSeguranca';

interface AlertasSegurancaContextType {
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  resolver: (id: string) => Promise<boolean>;
}

const AlertasSegurancaContext = createContext<AlertasSegurancaContextType | undefined>(undefined);

export function AlertasSegurancaProvider({ children }: { children: ReactNode }) {
  const { userProfile, isAuthenticated } = useUser();
  // isManager cobre Síndico/Administradora/Admin — o mesmo conjunto que
  // resolverEscopoConsulta aceita (Morador/Conselho seguem sem acesso).
  const podeVer = isAuthenticated && isManager(userProfile.role);

  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!podeVer) {
      setCount(0);
      return;
    }
    setLoading(true);
    try {
      const n = await contarAlertasAbertosAction();
      setCount(n);
    } catch (e) {
      console.error('Falha ao carregar contagem de alertas de segurança', e);
    } finally {
      setLoading(false);
    }
  }, [podeVer]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const resolver = useCallback(async (id: string): Promise<boolean> => {
    const res = await resolverAlertaAction(id);
    if (res.ok) {
      setCount((prev) => Math.max(0, prev - 1));
    }
    return res.ok;
  }, []);

  return (
    <AlertasSegurancaContext.Provider value={{ count, loading, refresh, resolver }}>
      {children}
    </AlertasSegurancaContext.Provider>
  );
}

export function useAlertasSeguranca(): AlertasSegurancaContextType {
  const ctx = useContext(AlertasSegurancaContext);
  if (!ctx) throw new Error('useAlertasSeguranca deve ser usado dentro de AlertasSegurancaProvider');
  return ctx;
}
