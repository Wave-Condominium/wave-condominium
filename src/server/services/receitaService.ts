// ---------------------------------------------------------------------------
// src/server/services/receitaService.ts  —  MOR-057
//
// Contabilização de receita a partir da confirmação de pagamento pelo PSP
// (fonte primária: webhook). Fluxo (PAG-005): confirmação → identifica a
// unidade/valor/data no boleto (cota) → baixa automática → cria a Receita
// contabilizada, com reconciliação (PAG-009) e origem rastreável.
//
// IDEMPOTENTE: uma receita por boleto — reprocessar o mesmo pagamento não
// duplica nem refaz a baixa. Compartilhado entre o webhook (rota HTTP) e a ação
// de "simular confirmação" (demo). Open Finance NÃO entra aqui (MOR-023).
// ---------------------------------------------------------------------------

import { prisma } from "@/server/db";
import { receitaRepository } from "@/server/repositories/receitaRepository";
import { reconciliar } from "@/components/treasury/receitas";

export interface ConfirmacaoPspInput {
  condominiumId: string;
  /** Identificação do boleto (cota): por id OU por unidade + mês de referência. */
  boletoId?: string;
  unitNumber?: string;
  referenceMonth?: string;
  valorPago: number;
  dataPagamento: Date;
  pspReferencia?: string;
}

export type ContabilizarResult =
  | { ok: true; receitaId: string; status: string; jaExistia: boolean }
  | { ok: false; error: string };

export async function contabilizarPagamentoPsp(input: ConfirmacaoPspInput): Promise<ContabilizarResult> {
  // Identifica a cota (boleto) — sempre escopado por condomínio.
  let boleto: any = null;
  if (input.boletoId) {
    boleto = await prisma.boleto.findFirst({ where: { id: input.boletoId, condominiumId: input.condominiumId } });
  } else if (input.unitNumber && input.referenceMonth) {
    boleto = await prisma.boleto.findFirst({
      where: { condominiumId: input.condominiumId, unitNumber: input.unitNumber, referenceMonth: input.referenceMonth },
    });
  }
  if (!boleto) return { ok: false, error: "Boleto (cota) não encontrado para a confirmação." };

  // Idempotência: uma receita por boleto (reprocessar não duplica).
  const existente = await receitaRepository.findByBoleto(boleto.id);
  if (existente) {
    return { ok: true, receitaId: (existente as any).id, status: (existente as any).status, jaExistia: true };
  }

  // Reconciliação (PAG-009): compara o valor pago com o boleto.
  const rec = reconciliar(input.valorPago, Number(boleto.amount));

  // Baixa automática (PAG-005): marca compensado + referência do PSP.
  await prisma.boleto.updateMany({
    where: { id: boleto.id, condominiumId: input.condominiumId },
    data: {
      status: "COMPENSATED",
      paidAt: boleto.paidAt ?? input.dataPagamento,
      compensatedAt: input.dataPagamento,
      pspReferencia: input.pspReferencia ?? null,
    },
  });

  const receita = await receitaRepository.create({
    condominiumId: input.condominiumId,
    boletoId: boleto.id,
    unitNumber: boleto.unitNumber,
    unitOwner: boleto.unitOwner,
    referenceMonth: boleto.referenceMonth,
    valor: input.valorPago,
    dataPagamento: input.dataPagamento,
    status: rec.status,
    origem: "PSP_WEBHOOK",
    pspReferencia: input.pspReferencia ?? null,
    divergenciaMotivo: rec.motivo ?? null,
  });

  return { ok: true, receitaId: (receita as any).id, status: rec.status, jaExistia: false };
}
