"use server";

// ---------------------------------------------------------------------------
// src/app/actions/unitDashboard.ts
//
// Dados do Dashboard do Morador sobre PostgreSQL. Retorna APENAS o que pertence
// a unidade do morador logado (unidade obtida no servidor a partir da sessao —
// nao confia no cliente). Comunicados reutilizam os avisos do condominio.
//
// Requer `prisma generate` (models DocumentoUnidade/SolicitacaoServico/ManutencaoUnidade).
// ---------------------------------------------------------------------------

import type { StatusOcorrencia as PrismaStatusOcorrencia } from "@prisma/client";
import { requireSession } from "@/server/auth/guard";
import { prisma } from "@/server/db";
import { unitRepository } from "@/server/repositories/unitRepository";
import { listAvisosAction } from "@/app/actions/avisos";
import type { Aviso } from "@/components/communication/types";
import {
  type DocumentoUnidade,
  type ManutencaoUnidade,
  type SolicitacaoServico,
  type StatusOcorrencia,
  normalizeUnidade,
} from "@/components/dashboard/moradorDashboardTypes";

const STATUS_FROM_DB: Record<PrismaStatusOcorrencia, StatusOcorrencia> = {
  ABERTA: "aberta", EM_ANDAMENTO: "em_andamento", CONCLUIDA: "concluida", CANCELADA: "cancelada",
  AGUARDANDO_APROVACAO: "aberta", RECUSADA: "cancelada",
};

function toDoc(d: any): DocumentoUnidade {
  return { id: d.id, unidade: d.unidade, titulo: d.titulo, tipo: d.tipo, data: new Date(d.data).toISOString() };
}
function toSolic(s: any): SolicitacaoServico {
  return {
    id: s.id, protocolo: s.protocolo, unidade: s.unidade, tipo: s.tipo,
    status: STATUS_FROM_DB[s.status as PrismaStatusOcorrencia],
    descricao: s.descricao ?? undefined,
    aberturaEm: new Date(s.aberturaEm).toISOString(),
    atualizadoEm: new Date(s.atualizadoEm).toISOString(),
  };
}
function toManut(m: any): ManutencaoUnidade {
  return {
    id: m.id, unidade: m.unidade, data: new Date(m.data).toISOString(),
    descricao: m.descricao, categoria: m.categoria,
    status: STATUS_FROM_DB[m.status as PrismaStatusOcorrencia], responsavel: m.responsavel,
  };
}

export interface MoradorDashboardPayload {
  documentos: DocumentoUnidade[];
  solicitacoes: SolicitacaoServico[];
  manutencoes: ManutencaoUnidade[];
  comunicados: Aviso[];
}

export async function getMoradorDashboardAction(): Promise<MoradorDashboardPayload> {
  const session = await requireSession();
  if (!session.condominiumId) {
    return { documentos: [], solicitacoes: [], manutencoes: [], comunicados: [] };
  }
  const cid = session.condominiumId;

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { unit: true } });
  const unidade = normalizeUnidade(user?.unit);

  const [docs, solic, manut, comunicados] = await Promise.all([
    unitRepository.listDocs(cid),
    unitRepository.listSolicitacoes(cid),
    unitRepository.listManutencoes(cid),
    listAvisosAction(),
  ]);

  const daUnidade = <T extends { unidade: string }>(arr: T[]) =>
    arr.filter((x) => normalizeUnidade(x.unidade) === unidade);

  return {
    documentos: daUnidade(docs).map(toDoc),
    solicitacoes: daUnidade(solic).map(toSolic),
    manutencoes: daUnidade(manut).map(toManut),
    comunicados,
  };
}
