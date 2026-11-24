"use server";

// ---------------------------------------------------------------------------
// src/app/actions/manutencao.ts
//
// Server Actions das Solicitações de manutenção do morador (SÍN-026).
//
// Segurança (validada NO SERVIDOR):
//   - Abrir solicitação / ver as próprias: qualquer sessão (morador), vinculada
//     à identidade do usuário e à sua unidade (não confia no cliente);
//   - Aprovar / recusar: exigem gestão (requireManager) — decisão na Central.
// Tudo escopado por session.condominiumId (multi-tenant).
//
// Requer `prisma generate` após o schema (SolicitacaoServico + novos status).
// ---------------------------------------------------------------------------

import type { StatusOcorrencia as PrismaStatusOcorrencia } from "@prisma/client";
import { requireSession, requireManager } from "@/server/auth/guard";
import { solicitacaoRepository } from "@/server/repositories/solicitacaoRepository";
import { userRepository } from "@/server/repositories/userRepository";
import {
  validarNovaSolicitacao,
  gerarProtocolo,
  type Solicitacao,
  type StatusSolicitacao,
  type NovaSolicitacaoInput,
  type PrioridadeSolicitacao,
} from "@/components/maintenance/solicitacoes";

const STATUS_FROM_DB: Record<PrismaStatusOcorrencia, StatusSolicitacao> = {
  ABERTA: "aguardando",
  AGUARDANDO_APROVACAO: "aguardando",
  EM_ANDAMENTO: "em_andamento",
  CONCLUIDA: "concluida",
  RECUSADA: "recusada",
  CANCELADA: "cancelada",
};

function toApp(s: any): Solicitacao {
  return {
    id: s.id,
    protocolo: s.protocolo,
    titulo: s.titulo ?? s.tipo,
    categoria: s.tipo,
    descricao: s.descricao ?? undefined,
    prioridade: (s.prioridade ?? "medium") as PrioridadeSolicitacao,
    unidade: s.unidade,
    solicitante: s.solicitante ?? undefined,
    status: STATUS_FROM_DB[s.status as PrismaStatusOcorrencia],
    motivoRecusa: s.motivoRecusa ?? undefined,
    aberturaEm: new Date(s.aberturaEm).toISOString(),
    decididoEm: s.decididoEm ? new Date(s.decididoEm).toISOString() : undefined,
  };
}

export type SolicitacaoResult = { ok: true; solicitacao: Solicitacao } | { ok: false; error: string };

// --- Morador: abrir e consultar as próprias solicitações ---------------------

export async function listMinhasSolicitacoesAction(): Promise<Solicitacao[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];
  const rows = await solicitacaoRepository.listBySolicitante(session.condominiumId, session.userId);
  return rows.map(toApp);
}

export async function criarSolicitacaoAction(input: NovaSolicitacaoInput): Promise<SolicitacaoResult> {
  const session = await requireSession();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const erro = validarNovaSolicitacao(input);
  if (erro) return { ok: false, error: erro };

  const user = await userRepository.findById(session.userId);
  const unidade = (user?.unit ?? "").replace(/^apto\s*/i, "").trim();
  if (!unidade) return { ok: false, error: "Não foi possível identificar sua unidade." };

  const row = await solicitacaoRepository.create({
    condominiumId: session.condominiumId,
    unidade,
    protocolo: gerarProtocolo(),
    tipo: input.categoria.trim(),
    titulo: input.titulo.trim(),
    prioridade: input.prioridade,
    descricao: input.descricao.trim(),
    status: "AGUARDANDO_APROVACAO",
    solicitanteId: session.userId,
    solicitante: user?.name ?? "Morador",
  });
  return { ok: true, solicitacao: toApp(row) };
}

// --- Gestor: decisão (via Central de Aprovações) -----------------------------

export async function aprovarSolicitacaoAction(id: string): Promise<SolicitacaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const s = await solicitacaoRepository.findById(id, session.condominiumId);
  if (!s) return { ok: false, error: "Solicitação não encontrada." };
  if ((s as any).status !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível aprovar solicitações aguardando aprovação." };
  }
  const gestor = await userRepository.findById(session.userId);
  await solicitacaoRepository.update(id, session.condominiumId, {
    status: "EM_ANDAMENTO",
    decididoPor: gestor?.name ?? "Gestor",
    decididoEm: new Date(),
    motivoRecusa: null,
  });
  const atualizado = await solicitacaoRepository.findById(id, session.condominiumId);
  return atualizado ? { ok: true, solicitacao: toApp(atualizado) } : { ok: false, error: "Falha ao aprovar." };
}

export async function recusarSolicitacaoAction(id: string, motivo: string): Promise<SolicitacaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  if (!motivo || motivo.trim().length < 3) {
    return { ok: false, error: "Informe o motivo da recusa." };
  }
  const s = await solicitacaoRepository.findById(id, session.condominiumId);
  if (!s) return { ok: false, error: "Solicitação não encontrada." };
  if ((s as any).status !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível recusar solicitações aguardando aprovação." };
  }
  const gestor = await userRepository.findById(session.userId);
  await solicitacaoRepository.update(id, session.condominiumId, {
    status: "RECUSADA",
    motivoRecusa: motivo.trim(),
    decididoPor: gestor?.name ?? "Gestor",
    decididoEm: new Date(),
  });
  const atualizado = await solicitacaoRepository.findById(id, session.condominiumId);
  return atualizado ? { ok: true, solicitacao: toApp(atualizado) } : { ok: false, error: "Falha ao recusar." };
}

// --- Agregador da Central: solicitações aguardando decisão -------------------

export async function listSolicitacoesAguardandoAction(): Promise<Solicitacao[]> {
  const session = await requireManager();
  if (!session.condominiumId) return [];
  const rows = await solicitacaoRepository.listByCondominium(session.condominiumId);
  return rows.map(toApp).filter((s) => s.status === "aguardando");
}
