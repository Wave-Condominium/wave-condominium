"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listarAlertasSegurancaAction,
  type AlertaSegurancaView,
} from "@/app/actions/alertasSeguranca";
import { useAlertasSeguranca as useAlertasSegurancaBadge } from "@/contexts/AlertasSegurancaContext";

export interface UseListaAlertasSegurancaResult {
  itens: AlertaSegurancaView[];
  loading: boolean;
  resolvendo: string | null;
  recarregar: () => Promise<void>;
  resolver: (id: string) => Promise<void>;
}

/** Lista de alertas ABERTOS para exibição na tela. */
export function useListaAlertasSeguranca(): UseListaAlertasSegurancaResult {
  const { resolver: resolverNoBadge } = useAlertasSegurancaBadge();
  const [itens, setItens] = useState<AlertaSegurancaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvendo, setResolvendo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const result = await listarAlertasSegurancaAction(1, true);
    if (result.ok) setItens(result.itens);
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const resolver = useCallback(
    async (id: string) => {
      setResolvendo(id);
      const ok = await resolverNoBadge(id);
      if (ok) setItens((prev) => prev.filter((a) => a.id !== id));
      setResolvendo(null);
    },
    [resolverNoBadge]
  );

  return { itens, loading, resolvendo, recarregar: carregar, resolver };
}
