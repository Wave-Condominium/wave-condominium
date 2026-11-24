"use server";

// ---------------------------------------------------------------------------
// src/app/actions/receitas.ts  —  MOR-057
//
// Leitura das receitas (cota condominial) e disparo simulado da confirmação do
// PSP (representa o webhook, para demonstração). Segurança NO SERVIDOR:
//   - Morador: vê APENAS as receitas da sua própria unidade (identidade da sessão);
//   - Simular confirmação / visão de conciliação: exigem gestão (requireManager).
// Tudo escopado por session.condominiumId (multi-tenant).
// ---------------------------------------------------------------------------

import { requireSession, requireManager } from "@/server/auth/guard";
import { receitaRepository } from "@/server/repositories/receitaRepository";
import { userRepository } from "@/server/repositories/userRepository";
import { prisma } from "@/server/db";
import { contabilizarPagamentoPsp } from "@/server/services/receitaService";
import { normalizarUnidade, type Receita } from "@/components/treasury/receitas";
import type { StatusContabilizacao } from "@/components/treasury/receitas";
import type { StatusContabilizacao as PrismaStatus } from "@prisma/client";

function toApp(r: any): Receita {
  return {
    id: r.id,
    unitNumber: r.unitNumber,
    unitOwner: r.unitOwner,
    referenceMonth: r.referenceMonth,
    valor: Number(r.valor),
    dataPagamento: new Date(r.dataPagamento).toISOString(),
    status: r.status as StatusContabilizacao,
    origem: "PSP_WEBHOOK",
    pspReferencia: r.pspReferencia ?? undefined,
    divergenciaMotivo: r.divergenciaMotivo ?? undefined,
    boletoId: r.boletoId ?? undefined,
  };
}

/** Receitas da própria unidade do morador (histórico mensal das cotas). */
export async function listMinhasReceitasAction(): Promise<Receita[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];

  const user = await userRepository.findById(session.userId);
  const unidade = normalizarUnidade((user as any)?.unit ?? "");
  if (!unidade) return [];

  const todas = await receitaRepository.listByCondominium(session.condominiumId);
  return todas.filter((r: any) => normalizarUnidade(r.unitNumber) === unidade).map(toApp);
}

/** Todas as receitas do condomínio (gestão) — base da conciliação. */
export async function listReceitasCondominioAction(): Promise<Receita[]> {
  const session = await requireManager();
  if (!session.condominiumId) return [];
  const todas = await receitaRepository.listByCondominium(session.condominiumId);
  return todas.map(toApp);
}

export type SimularResult = { ok: true; status: PrismaStatus; jaExistia: boolean } | { ok: false; error: string };

/**
 * Simula a confirmação do PSP para um boleto (representa o webhook) — faz a baixa
 * e contabiliza a receita. Exclusivo de gestão; escopado por condomínio.
 */
export async function simularConfirmacaoPagamentoPspAction(boletoId: string): Promise<SimularResult> {
  const session = await requireManager();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado." };

  const boleto = await prisma.boleto.findFirst({
    where: { id: boletoId, condominiumId: session.condominiumId },
    select: { id: true, amount: true },
  });
  if (!boleto) return { ok: false, error: "Boleto não encontrado." };

  const res = await contabilizarPagamentoPsp({
    condominiumId: session.condominiumId,
    boletoId,
    valorPago: Number((boleto as any).amount),
    dataPagamento: new Date(),
    pspReferencia: `psp_tx_${Date.now().toString(36)}`,
  });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, status: res.status as PrismaStatus, jaExistia: res.jaExistia };
}
