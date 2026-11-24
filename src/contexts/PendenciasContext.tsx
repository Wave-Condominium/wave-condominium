'use client';

// ---------------------------------------------------------------------------
// src/contexts/PendenciasContext.tsx
//
// Estado compartilhado da Central de Aprovações (SÍN-026). Une o CONTADOR do
// menu lateral e a LISTA da Central numa única fonte, para que uma decisão
// tomada na Central atualize o contador automaticamente (e vice-versa).
//
// Só carrega para perfis de gestão (Síndico/Admin). A autorização real é do
// servidor (requireManager); aqui apenas evitamos a chamada para não-gestores.
// ---------------------------------------------------------------------------

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';
import {
  listPendenciasAction,
  decidirPendenciaAction,
  type DecidirPendenciaResult,
} from '@/app/actions/aprovacoes';
import type { Pendencia, Decisao } from '@/components/approvals/pendencias';

interface PendenciasContextType {
  pendencias: Pendencia[];
  count: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  decidir: (pendencia: Pendencia, decisao: Decisao, motivo?: string) => Promise<DecidirPendenciaResult>;
}

const PendenciasContext = createContext<PendenciasContextType | undefined>(undefined);

export function PendenciasProvider({ children }: { children: ReactNode }) {
  const { userProfile, isAuthenticated } = useUser();
  const gestor = isAuthenticated && isManager(userProfile.role);

  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gestor) {
      setPendencias([]);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const lista = await listPendenciasAction();
      setPendencias(lista);
      setError(null);
    } catch (e) {
      console.error('Falha ao carregar pendências', e);
      setError('Não foi possível carregar as aprovações.');
    } finally {
      setLoading(false);
    }
  }, [gestor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const decidir = useCallback(
    async (pendencia: Pendencia, decisao: Decisao, motivo?: string): Promise<DecidirPendenciaResult> => {
      const res = await decidirPendenciaAction({ tipo: pendencia.tipo, id: pendencia.id, decisao, motivo });
      // Item processado não deve permanecer pendente (contador cai na hora).
      if (res.ok) {
        setPendencias((prev) => prev.filter((x) => !(x.tipo === pendencia.tipo && x.id === pendencia.id)));
      }
      return res;
    },
    [],
  );

  return (
    <PendenciasContext.Provider value={{ pendencias, count: pendencias.length, loading, error, refresh, decidir }}>
      {children}
    </PendenciasContext.Provider>
  );
}

export function usePendencias(): PendenciasContextType {
  const ctx = useContext(PendenciasContext);
  if (!ctx) throw new Error('usePendencias deve ser usado dentro de PendenciasProvider');
  return ctx;
}
