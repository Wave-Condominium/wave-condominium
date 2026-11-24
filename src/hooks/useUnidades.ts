'use client';

// ---------------------------------------------------------------------------
// src/hooks/useUnidades.ts
//
// Acesso às unidades do condomínio (SÍN-021). Fonte real = PostgreSQL, via
// Server Actions escopadas por condomínio. Assíncrono, com loading/error —
// mesmo padrão de useDespesas/useFinancialSummary.
//
// Leitura: qualquer usuário autenticado. Escrita: autorização validada no
// SERVIDOR (requireManager).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import {
  listUnidadesAction,
  criarUnidadeAction,
  atualizarUnidadeAction,
  atualizarStatusUnidadeAction,
  removerUnidadeAction,
  type UnidadeResult,
} from '@/app/actions/unidades';
import type { Unidade, UnidadeInput, StatusUnidade } from '@/components/units/unidades';

export interface UseUnidadesResult {
  unidades: Unidade[];
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;
  criar: (input: UnidadeInput) => Promise<UnidadeResult>;
  atualizar: (id: string, input: UnidadeInput) => Promise<UnidadeResult>;
  atualizarStatus: (id: string, status: StatusUnidade) => Promise<UnidadeResult>;
  remover: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useUnidades(): UseUnidadesResult {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const lista = await listUnidadesAction();
      setUnidades(lista);
      setError(null);
    } catch (err) {
      console.error('Falha ao carregar unidades', err);
      setError('Não foi possível carregar as unidades.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listUnidadesAction()
      .then((lista) => { if (alive) { setUnidades(lista); setError(null); } })
      .catch((err) => {
        console.error('Falha ao carregar unidades', err);
        if (alive) setError('Não foi possível carregar as unidades.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const criar = useCallback(async (input: UnidadeInput) => {
    const res = await criarUnidadeAction(input);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  const atualizar = useCallback(async (id: string, input: UnidadeInput) => {
    const res = await atualizarUnidadeAction(id, input);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  const atualizarStatus = useCallback(async (id: string, status: StatusUnidade) => {
    const res = await atualizarStatusUnidadeAction(id, status);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  const remover = useCallback(async (id: string) => {
    const res = await removerUnidadeAction(id);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  return { unidades, loading, error, recarregar, criar, atualizar, atualizarStatus, remover };
}
