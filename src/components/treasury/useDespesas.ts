'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/useDespesas.ts
//
// Acesso às despesas do condomínio (SÍN-011). Fonte real = PostgreSQL, via
// Server Actions escopadas por condomínio. Assíncrono, expõe `loading` e
// `error` (mesmo padrão de `useFinancialSummary`).
//
// Leitura: qualquer usuário autenticado do condomínio (o Morador consulta).
// Escrita (`criar`, `registrarPagamento`, `anexarComprovante`): a autorização
// é validada NO SERVIDOR (requireManager) — a UI apenas oculta os controles.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import {
  listDespesasAction,
  criarDespesaAction,
  registrarPagamentoDespesaAction,
  anexarComprovanteDespesaAction,
  type CriarDespesaInput,
  type RegistrarPagamentoActionInput,
  type ComprovanteInput,
  type DespesaResult,
} from '@/app/actions/despesas';
import type { Despesa } from './despesas';

export interface UseDespesasResult {
  despesas: Despesa[];
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;
  criar: (input: CriarDespesaInput) => Promise<DespesaResult>;
  registrarPagamento: (id: string, input: RegistrarPagamentoActionInput) => Promise<DespesaResult>;
  anexarComprovante: (id: string, comprovante: ComprovanteInput) => Promise<DespesaResult>;
}

export function useDespesas(): UseDespesasResult {
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const lista = await listDespesasAction();
      setDespesas(lista);
      setError(null);
    } catch (err) {
      console.error('Falha ao carregar despesas', err);
      setError('Não foi possível carregar as despesas.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listDespesasAction()
      .then((lista) => { if (alive) { setDespesas(lista); setError(null); } })
      .catch((err) => {
        console.error('Falha ao carregar despesas', err);
        if (alive) setError('Não foi possível carregar as despesas.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const criar = useCallback(async (input: CriarDespesaInput): Promise<DespesaResult> => {
    const res = await criarDespesaAction(input);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  const registrarPagamento = useCallback(
    async (id: string, input: RegistrarPagamentoActionInput): Promise<DespesaResult> => {
      const res = await registrarPagamentoDespesaAction(id, input);
      if (res.ok) await recarregar();
      return res;
    },
    [recarregar],
  );

  const anexarComprovante = useCallback(
    async (id: string, comprovante: ComprovanteInput): Promise<DespesaResult> => {
      const res = await anexarComprovanteDespesaAction(id, comprovante);
      if (res.ok) await recarregar();
      return res;
    },
    [recarregar],
  );

  return { despesas, loading, error, recarregar, criar, registrarPagamento, anexarComprovante };
}
