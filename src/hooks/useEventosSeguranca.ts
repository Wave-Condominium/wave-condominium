"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarEventosSegurancaAction,
  type EventoSegurancaView,
} from "@/app/actions/eventosSeguranca";

export interface UseEventosSegurancaResult {
  itens: EventoSegurancaView[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  semPermissao: boolean;
  irParaPagina: (page: number) => void;
  recarregar: () => Promise<void>;
}

export function useEventosSeguranca(): UseEventosSegurancaResult {
  const [itens, setItens] = useState<EventoSegurancaView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  const carregar = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    const result = await listarEventosSegurancaAction(p);
    if (!result.ok) {
      // "Sem permissão" é um estado distinto de erro técnico — a página usa
      // isso pra mostrar uma mensagem de acesso restrito, não um erro genérico.
      setSemPermissao(result.error.includes("permissão"));
      setError(result.error);
      setItens([]);
      setLoading(false);
      return;
    }
    setItens(result.itens);
    setTotal(result.total);
    setPage(result.page);
    setPageSize(result.pageSize);
    setLoading(false);
  }, []);

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  return {
    itens,
    total,
    page,
    pageSize,
    loading,
    error,
    semPermissao,
    irParaPagina: (p: number) => carregar(p),
    recarregar: () => carregar(page),
  };
}
