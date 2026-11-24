"use server";

// ---------------------------------------------------------------------------
// src/app/actions/configuracoes.ts
//
// Server Actions de configuração do condomínio. Nesta fase, a alçada de
// aprovação de despesas (SÍN-026, financeiro). Escopado por condomínio e
// exclusivo de gestão (requireManager) — validado no servidor.
// ---------------------------------------------------------------------------

import { requireSession, requireManager } from "@/server/auth/guard";
import { condominiumRepository } from "@/server/repositories/condominiumRepository";

/** Lê a alçada de aprovação do condomínio ativo (null = sem alçada). */
export async function getAlcadaAction(): Promise<number | null> {
  const session = await requireSession();
  if (!session.condominiumId) return null;
  return condominiumRepository.getAlcada(session.condominiumId);
}

export type SetAlcadaResult = { ok: true; alcada: number | null } | { ok: false; error: string };

/**
 * Define a alçada de aprovação. `null` (ou <= 0) remove a alçada — nesse caso
 * toda despesa segue direto para PENDENTE (comportamento anterior).
 */
export async function setAlcadaAction(valor: number | null): Promise<SetAlcadaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  if (valor != null && (Number.isNaN(valor) || valor < 0)) {
    return { ok: false, error: "Informe um valor de alçada válido." };
  }
  // 0 ou negativo = sem alçada (limpa).
  const normalizado = valor != null && valor > 0 ? valor : null;
  await condominiumRepository.setAlcada(session.condominiumId, normalizado);
  return { ok: true, alcada: normalizado };
}
