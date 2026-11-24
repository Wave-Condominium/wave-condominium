'use client';

// ---------------------------------------------------------------------------
// src/hooks/useReunioes.ts
//
// Acesso às Reuniões & confirmações do condomínio (SÍN-026). Fonte real =
// PostgreSQL, via Server Actions escopadas por condomínio. Assíncrono, com
// loading/error — mesmo padrão de useUnidades/useConvites.
//
// Escrita: criar reunião / salvar ata exigem gestão (validado no SERVIDOR);
// confirmar presença é vinculado à identidade da sessão.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import {
  listReunioesAction,
  listConfirmacoesAction,
  criarReuniaoAction,
  salvarAtaAction,
  confirmarPresencaAction,
  type ReuniaoResult,
} from '@/app/actions/reunioes';
import type { Reuniao, NovaReuniaoInput } from '@/components/meetings/reunioes';
import type { ConfirmacaoPresenca } from '@/components/meetings/presencaConfirmacoes';

export interface UseReunioesResult {
  reunioes: Reuniao[];
  confirmacoes: ConfirmacaoPresenca[];
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;
  criar: (input: NovaReuniaoInput) => Promise<ReuniaoResult>;
  salvarAta: (id: string, conteudo: string) => Promise<ReuniaoResult>;
  confirmarPresenca: (reuniaoId: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useReunioes(): UseReunioesResult {
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [confirmacoes, setConfirmacoes] = useState<ConfirmacaoPresenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [rs, cs] = await Promise.all([listReunioesAction(), listConfirmacoesAction()]);
      setReunioes(rs);
      setConfirmacoes(cs);
      setError(null);
    } catch (err) {
      console.error('Falha ao carregar reuniões', err);
      setError('Não foi possível carregar as reuniões.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([listReunioesAction(), listConfirmacoesAction()])
      .then(([rs, cs]) => { if (alive) { setReunioes(rs); setConfirmacoes(cs); setError(null); } })
      .catch((err) => {
        console.error('Falha ao carregar reuniões', err);
        if (alive) setError('Não foi possível carregar as reuniões.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const criar = useCallback(async (input: NovaReuniaoInput): Promise<ReuniaoResult> => {
    const res = await criarReuniaoAction(input);
    if (res.ok) setReunioes((prev) => [res.reuniao, ...prev]);
    return res;
  }, []);

  const salvarAta = useCallback(async (id: string, conteudo: string): Promise<ReuniaoResult> => {
    const res = await salvarAtaAction(id, conteudo);
    if (res.ok) setReunioes((prev) => prev.map((r) => (r.id === id ? res.reuniao : r)));
    return res;
  }, []);

  const confirmarPresenca = useCallback(async (reuniaoId: string) => {
    const res = await confirmarPresencaAction(reuniaoId);
    if (res.ok) await recarregar(); // atualiza contagem + lista de confirmações
    return res;
  }, [recarregar]);

  return { reunioes, confirmacoes, loading, error, recarregar, criar, salvarAta, confirmarPresenca };
}
