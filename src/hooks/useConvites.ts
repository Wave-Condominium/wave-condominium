'use client';

// ---------------------------------------------------------------------------
// src/hooks/useConvites.ts
//
// Acesso aos Convites de acesso de moradores (SÍN-022). Fonte real =
// PostgreSQL, via Server Actions escopadas por condomínio. Assíncrono, com
// loading/error — mesmo padrão de useUnidades/useDespesas.
//
// Escrita (gerar/reenviar/revogar): autorização validada no SERVIDOR
// (requireManager). A senha NUNCA transita por aqui — é definida pelo morador
// na ativação. O token em claro só chega no retorno de gerar/reenviar, para o
// link copiável, e não é persistido no cliente.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import {
  listConvitesAction,
  gerarConviteAction,
  reenviarConviteAction,
  revogarConviteAction,
  registrarTrocaAction,
  type GerarConviteInput,
  type GerarConviteResult,
  type ReenviarConviteResult,
  type RevogarConviteResult,
  type RegistrarTrocaInput,
  type RegistrarTrocaResult,
} from '@/app/actions/convites';
import type { ConviteAcesso } from '@/components/access/convites';

export interface UseConvitesResult {
  convites: ConviteAcesso[];
  loading: boolean;
  error: string | null;
  recarregar: () => Promise<void>;
  gerar: (input: GerarConviteInput) => Promise<GerarConviteResult>;
  reenviar: (id: string) => Promise<ReenviarConviteResult>;
  revogar: (id: string) => Promise<RevogarConviteResult>;
  registrarTroca: (input: RegistrarTrocaInput) => Promise<RegistrarTrocaResult>;
}

export function useConvites(): UseConvitesResult {
  const [convites, setConvites] = useState<ConviteAcesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const lista = await listConvitesAction();
      setConvites(lista);
      setError(null);
    } catch (err) {
      console.error('Falha ao carregar convites', err);
      setError('Não foi possível carregar os acessos.');
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listConvitesAction()
      .then((lista) => { if (alive) { setConvites(lista); setError(null); } })
      .catch((err) => {
        console.error('Falha ao carregar convites', err);
        if (alive) setError('Não foi possível carregar os acessos.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const gerar = useCallback(async (input: GerarConviteInput): Promise<GerarConviteResult> => {
    const res = await gerarConviteAction(input);
    if (res.ok) setConvites((prev) => [res.resultado.convite, ...prev]);
    return res;
  }, []);

  const reenviar = useCallback(async (id: string): Promise<ReenviarConviteResult> => {
    const res = await reenviarConviteAction(id);
    if (res.ok) {
      setConvites((prev) => prev.map((c) => (c.id === id ? res.resultado.convite : c)));
    }
    return res;
  }, []);

  const revogar = useCallback(async (id: string): Promise<RevogarConviteResult> => {
    const res = await revogarConviteAction(id);
    if (res.ok) {
      setConvites((prev) => prev.map((c) => (c.id === id ? res.convite : c)));
    }
    return res;
  }, []);

  // Troca (venda/locação): mexe em vários convites (revoga anterior + cria
  // novo), então recarrega a lista para refletir o estado consistente.
  const registrarTroca = useCallback(async (input: RegistrarTrocaInput): Promise<RegistrarTrocaResult> => {
    const res = await registrarTrocaAction(input);
    if (res.ok) await recarregar();
    return res;
  }, [recarregar]);

  return { convites, loading, error, recarregar, gerar, reenviar, revogar, registrarTroca };
}
