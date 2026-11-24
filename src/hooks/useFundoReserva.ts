'use client';

// ---------------------------------------------------------------------------
// src/hooks/useFundoReserva.ts  —  MOR-023
//
// Estado do Fundo de Reserva (Open Finance) para o Dashboard. Fonte real =
// PostgreSQL via Server Actions. Faz a "atualização automática ao abrir": se há
// conexão ativa e o último snapshot está desatualizado, reconsulta o banco.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from 'react';

import {
  getFundoReservaAction,
  atualizarFundoReservaAction,
  conectarOpenFinanceAction,
  desconectarOpenFinanceAction,
  type FundoReservaResult,
} from '@/app/actions/fundoReserva';
import {
  estaDesatualizado,
  precisaReconectar,
  type FundoReservaView,
} from '@/components/fundoReserva/fundoReserva';

export function useFundoReserva() {
  const [view, setView] = useState<FundoReservaView | null>(null);
  const [podeGerenciar, setPodeGerenciar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async (autoRefresh = true) => {
    const res = await getFundoReservaAction();
    if (!res.ok) { setError(res.error); return; }
    setPodeGerenciar(res.podeGerenciar);
    setError(null);

    // Atualização automática ao abrir: conectado + consentimento válido +
    // snapshot velho → reconsulta antes de exibir (evita dado desatualizado).
    if (
      autoRefresh &&
      !precisaReconectar(res.view.status, res.view.consentimentoExpiraEm) &&
      estaDesatualizado(res.view.consultadoEm)
    ) {
      const upd = await atualizarFundoReservaAction();
      if (upd.ok) { setView(upd.view); return; }
    }
    setView(res.view);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    carregar().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [carregar]);

  const atualizar = useCallback(async (): Promise<FundoReservaResult> => {
    setBusy(true);
    const r = await atualizarFundoReservaAction();
    setBusy(false);
    if (r.ok) { setView(r.view); setError(null); } else setError(r.error);
    return r;
  }, []);

  const conectar = useCallback(async (): Promise<FundoReservaResult> => {
    setBusy(true);
    const r = await conectarOpenFinanceAction();
    setBusy(false);
    if (r.ok) { setView(r.view); setPodeGerenciar(true); setError(null); } else setError(r.error);
    return r;
  }, []);

  const desconectar = useCallback(async () => {
    setBusy(true);
    await desconectarOpenFinanceAction();
    setBusy(false);
    await carregar(false);
  }, [carregar]);

  return { view, podeGerenciar, loading, busy, error, atualizar, conectar, desconectar };
}
