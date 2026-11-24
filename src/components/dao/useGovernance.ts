'use client';

// ---------------------------------------------------------------------------
// src/components/dao/useGovernance.ts
//
// Camada de dados da Governanca — agora sobre PostgreSQL via Server Actions.
//
// As regras de negocio (voto unico, apuracao por prazo, resultado por maioria
// de todos os moradores) sao aplicadas NO SERVIDOR. Aqui o hook apenas busca,
// dispara as actions e reflete o resultado no estado. A UI (GovernanceView,
// dashboard, fila) permanece igual — muda so a origem dos dados.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type Categoria,
  type GovernanceConfig,
  type Proposta,
  type VoteChoice,
  DEFAULT_CONFIG,
  isAprovada,
  isEmVotacao,
  ordenarFila,
} from './governanceCore';
import {
  listPropostasAction,
  criarPropostaAction,
  votarAction,
  encerrarVotacaoAction,
  rejeitarPropostaAction,
} from '@/app/actions/governanca';

export interface GovernanceStats {
  emVotacao: number;
  aprovadas: number;
  rejeitadas: number;
  totalParticipantes: number;
  taxaParticipacao: number; // 0-100
  ranking: Proposta[];
}

export interface UseGovernanceResult {
  propostas: Proposta[];
  loading: boolean;
  emVotacao: Proposta[];
  aprovadas: Proposta[];
  fila: Proposta[];
  config: GovernanceConfig;
  stats: GovernanceStats;
  criarProposta: (input: { titulo: string; descricao: string; categoria: Categoria }, autor: string) => Promise<Proposta | null>;
  votar: (propostaId: string, userId: string, escolha: VoteChoice) => Promise<'ok' | 'ja_votou' | 'encerrada'>;
  encerrarVotacao: (propostaId: string) => Promise<void>;
  /** Rejeita a proposta com justificativa obrigatória, mantendo-a no histórico (SÍN-005). */
  rejeitarProposta: (propostaId: string, motivo: string) => Promise<{ ok: boolean; error?: string }>;
  setTotalMoradores: (n: number) => void;
}

export function useGovernance(): UseGovernanceResult {
  const [propostas, setPropostas] = useState<Proposta[]>([]);
  const [config, setConfig] = useState<GovernanceConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { propostas: lista, totalMoradores } = await listPropostasAction();
    setPropostas(lista);
    setConfig({ totalMoradores });
  }, []);

  useEffect(() => {
    let alive = true;
    refresh()
      .catch((err) => console.error('Falha ao carregar propostas', err))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const emVotacao = useMemo(() => propostas.filter(isEmVotacao), [propostas]);
  const aprovadas = useMemo(() => propostas.filter(isAprovada), [propostas]);
  const fila = useMemo(() => ordenarFila(aprovadas), [aprovadas]);

  const stats = useMemo<GovernanceStats>(() => {
    const rejeitadas = propostas.filter((p) => p.status === 'rejeitada').length;
    const votantes = new Set<string>();
    let somaParticipacao = 0;
    let comVotos = 0;
    for (const p of propostas) {
      const ids = Object.keys(p.votos || {});
      ids.forEach((id) => votantes.add(id));
      if (p.status !== 'votacao_aberta' || ids.length > 0) {
        somaParticipacao += config.totalMoradores > 0 ? ids.length / config.totalMoradores : 0;
        comVotos++;
      }
    }
    const taxa = comVotos > 0 ? Math.round((somaParticipacao / comVotos) * 100) : 0;
    return {
      emVotacao: emVotacao.length,
      aprovadas: aprovadas.length,
      rejeitadas,
      totalParticipantes: votantes.size,
      taxaParticipacao: Math.min(100, taxa),
      ranking: ordenarFila(propostas).slice(0, 5),
    };
  }, [propostas, emVotacao.length, aprovadas.length, config.totalMoradores]);

  const criarProposta = useCallback(
    async (input: { titulo: string; descricao: string; categoria: Categoria }, autor: string) => {
      const nova = await criarPropostaAction(input, autor);
      if (nova) setPropostas((prev) => [nova, ...prev]);
      return nova;
    },
    [],
  );

  const votar = useCallback(
    async (propostaId: string, userId: string, escolha: VoteChoice) => {
      const r = await votarAction(propostaId, escolha);
      if (r === 'ok') {
        setPropostas((prev) =>
          prev.map((p) =>
            p.id === propostaId ? { ...p, votos: { ...p.votos, [userId]: escolha } } : p,
          ),
        );
      } else if (r === 'encerrada') {
        // A votacao ja tinha encerrado no servidor — sincroniza a lista.
        void refresh();
      }
      return r;
    },
    [refresh],
  );

  const encerrarVotacao = useCallback(
    async (propostaId: string) => {
      await encerrarVotacaoAction(propostaId);
      await refresh();
    },
    [refresh],
  );

  const rejeitarProposta = useCallback(async (propostaId: string, motivo: string) => {
    const res = await rejeitarPropostaAction(propostaId, motivo);
    if (res.ok) {
      // Mantém a proposta na lista (agora REJEITADA) — preserva o histórico.
      setPropostas((prev) => prev.map((p) => (p.id === propostaId ? res.proposta : p)));
      return { ok: true as const };
    }
    return { ok: false as const, error: res.error };
  }, []);

  const setTotalMoradores = useCallback(
    (n: number) => setConfig({ totalMoradores: Math.max(1, Math.round(n)) }),
    [],
  );

  return {
    propostas, loading, emVotacao, aprovadas, fila, config, stats,
    criarProposta, votar, encerrarVotacao, rejeitarProposta, setTotalMoradores,
  };
}
