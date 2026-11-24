"use server";

// ---------------------------------------------------------------------------
// src/app/actions/reunioes.ts
//
// Server Actions de Reuniões & Atas (SÍN-026) sobre PostgreSQL.
//
// Segurança (validada NO SERVIDOR):
//   - Leitura: qualquer usuário autenticado do condomínio;
//   - Criar reunião / salvar ata: exigem gestão (requireManager) — MOR-055;
//   - Confirmar presença: qualquer sessão, vinculada à identidade do usuário
//     (MOR-032), uma confirmação por usuário/reunião.
// Tudo escopado por session.condominiumId (multi-tenant).
//
// Requer `prisma generate` após o schema (models Reuniao/ConfirmacaoPresenca).
// ---------------------------------------------------------------------------

import type { StatusReuniao as PrismaStatusReuniao } from "@prisma/client";
import { requireSession, requireManager } from "@/server/auth/guard";
import { isManager } from "@/lib/rbac";
import { reuniaoRepository } from "@/server/repositories/reuniaoRepository";
import { userRepository } from "@/server/repositories/userRepository";
import { calcularHashAta } from "@/components/meetings/atasIntegridade";
import {
  validarNovaReuniao,
  type Reuniao,
  type StatusReuniao,
  type NovaReuniaoInput,
} from "@/components/meetings/reunioes";
import type { ConfirmacaoPresenca } from "@/components/meetings/presencaConfirmacoes";

const STATUS_FROM_DB: Record<PrismaStatusReuniao, StatusReuniao> = {
  RASCUNHO: "draft",
  AGENDADA: "scheduled",
  EM_ANDAMENTO: "ongoing",
  CONCLUIDA: "completed",
};

function toApp(r: any): Reuniao {
  return {
    id: r.id,
    title: r.titulo,
    description: r.descricao,
    date: r.data,
    time: r.horario,
    duration: r.duracao,
    meetLink: r.meetLink ?? "",
    status: STATUS_FROM_DB[r.status as PrismaStatusReuniao],
    participants: r._count?.confirmacoes ?? 0,
    maxParticipants: r.maxParticipantes,
    agenda: r.pauta ?? [],
    createdBy: r.criadoPor,
    createdAt: new Date(r.criadoEm).toLocaleDateString("pt-BR"),
    createdAtISO: new Date(r.criadoEm).toISOString(),
    ataContent: r.ataContent ?? undefined,
    ataHash: r.ataHash ?? undefined,
    recordingUrl: r.recordingUrl ?? undefined,
    ataStatus: r.ataStatus ?? undefined,
    ataMotivoRejeicao: r.ataMotivoRejeicao ?? undefined,
  };
}

function toConfirmacao(c: any): ConfirmacaoPresenca {
  return {
    meetingId: c.reuniaoId,
    nome: c.nome,
    unidade: c.unidade ?? "",
    confirmadoEm: new Date(c.confirmadoEm).toISOString(),
  };
}

export type ReuniaoResult = { ok: true; reuniao: Reuniao } | { ok: false; error: string };

// --- Leitura -----------------------------------------------------------------

export async function listReunioesAction(): Promise<Reuniao[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];
  const rows = await reuniaoRepository.listByCondominium(session.condominiumId);
  // Convocações em RASCUNHO só são visíveis à gestão até serem publicadas
  // (SÍN-026). O morador nunca recebe um rascunho — filtro NO SERVIDOR.
  const gestor = isManager(session.role);
  return rows.filter((r: any) => gestor || r.status !== "RASCUNHO").map(toApp);
}

export async function listConfirmacoesAction(): Promise<ConfirmacaoPresenca[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];
  const rows = await reuniaoRepository.listConfirmacoesByCondominium(session.condominiumId);
  return rows.map(toConfirmacao);
}

// --- Criação (gestor) --------------------------------------------------------

export async function criarReuniaoAction(input: NovaReuniaoInput): Promise<ReuniaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const erro = validarNovaReuniao(input);
  if (erro) return { ok: false, error: erro };

  const gestor = await userRepository.findById(session.userId);
  const row = await reuniaoRepository.create({
    condominiumId: session.condominiumId,
    titulo: input.title.trim(),
    descricao: input.description.trim(),
    data: input.date,
    horario: input.time,
    duracao: input.duration,
    meetLink: input.meetLink?.trim() || "",
    maxParticipantes: input.maxParticipants,
    pauta: input.agenda.filter((i) => i && i.trim()),
    // SÍN-026: nasce como RASCUNHO — só vira AGENDADA (visível aos moradores)
    // após a publicação do síndico na Central de Aprovações.
    status: "RASCUNHO",
    criadoPor: gestor?.name ?? "Gestor",
  });
  return { ok: true, reuniao: toApp({ ...row, _count: { confirmacoes: 0 } }) };
}

// --- Publicação / descarte da convocação (gestor) — SÍN-026 ------------------

/**
 * Publica a convocação (RASCUNHO → AGENDADA), tornando-a visível aos moradores.
 * Decisão do síndico na Central de Aprovações. Só rascunhos podem ser publicados.
 */
export async function publicarReuniaoAction(id: string): Promise<ReuniaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const existente = await reuniaoRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Reunião não encontrada." };
  if ((existente as any).status !== "RASCUNHO") {
    return { ok: false, error: "Só é possível publicar convocações em rascunho." };
  }
  await reuniaoRepository.update(id, session.condominiumId, { status: "AGENDADA" });
  return recarregarReuniao(id, session.condominiumId);
}

/**
 * Descarta (remove) uma convocação em rascunho — rejeição na Central. Somente
 * rascunhos podem ser descartados (nunca uma reunião já publicada/visível).
 */
export async function descartarReuniaoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const existente = await reuniaoRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Reunião não encontrada." };
  if ((existente as any).status !== "RASCUNHO") {
    return { ok: false, error: "Só é possível descartar convocações em rascunho." };
  }
  await reuniaoRepository.remove(id, session.condominiumId);
  return { ok: true };
}

// --- Ata (gestor) — Etapa B: salvar envia a ata para aprovação ---------------

/** Recarrega uma reunião (com contagem) e devolve o resultado padronizado. */
async function recarregarReuniao(id: string, condominiumId: string): Promise<ReuniaoResult> {
  const rows = await reuniaoRepository.listByCondominium(condominiumId);
  const atualizada = rows.find((r: any) => r.id === id);
  return atualizada ? { ok: true, reuniao: toApp(atualizada) } : { ok: false, error: "Reunião não encontrada." };
}

/**
 * Salva/atualiza a ata como RASCUNHO e a envia para aprovação
 * (AGUARDANDO_APROVACAO). O código de integridade (MOR-033) é registrado já no
 * envio; a ata só vira OFICIAL após a aprovação do síndico na Central.
 * A reunião é marcada como CONCLUÍDA (a ata é redigida após a reunião).
 * Uma ata já OFICIAL fica travada (integridade) e não é reeditada aqui.
 */
export async function salvarAtaAction(id: string, conteudo: string): Promise<ReuniaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  if (!conteudo || !conteudo.trim()) {
    return { ok: false, error: "Informe o conteúdo da ata." };
  }
  const existente = await reuniaoRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Reunião não encontrada." };
  if ((existente as any).ataStatus === "OFICIAL") {
    return { ok: false, error: "Esta ata já é oficial e não pode ser reeditada." };
  }

  await reuniaoRepository.update(id, session.condominiumId, {
    ataContent: conteudo,
    ataHash: calcularHashAta(conteudo),
    ataStatus: "AGUARDANDO_APROVACAO",
    ataMotivoRejeicao: null,
    status: "CONCLUIDA",
  });
  return recarregarReuniao(id, session.condominiumId);
}

/** Aprova a ata (RASCUNHO/AGUARDANDO → OFICIAL). Decisão do síndico na Central. */
export async function aprovarAtaAction(id: string): Promise<ReuniaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const existente = await reuniaoRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Reunião não encontrada." };
  if ((existente as any).ataStatus !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível aprovar atas aguardando aprovação." };
  }
  const gestor = await userRepository.findById(session.userId);
  await reuniaoRepository.update(id, session.condominiumId, {
    ataStatus: "OFICIAL",
    ataAprovadaPor: gestor?.name ?? "Gestor",
    ataAprovadaEm: new Date(),
    ataMotivoRejeicao: null,
  });
  return recarregarReuniao(id, session.condominiumId);
}

/** Rejeita a ata (AGUARDANDO → RASCUNHO), com motivo, para revisão e reenvio. */
export async function rejeitarAtaAction(id: string, motivo: string): Promise<ReuniaoResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  if (!motivo || motivo.trim().length < 3) {
    return { ok: false, error: "Informe o motivo da rejeição da ata." };
  }
  const existente = await reuniaoRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Reunião não encontrada." };
  if ((existente as any).ataStatus !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível rejeitar atas aguardando aprovação." };
  }
  await reuniaoRepository.update(id, session.condominiumId, {
    ataStatus: "RASCUNHO",
    ataMotivoRejeicao: motivo.trim(),
  });
  return recarregarReuniao(id, session.condominiumId);
}

// --- Confirmação de presença (morador) ---------------------------------------

export async function confirmarPresencaAction(reuniaoId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado na sessão." };

  const reuniao = await reuniaoRepository.findById(reuniaoId, session.condominiumId);
  if (!reuniao) return { ok: false, error: "Reunião não encontrada." };

  const user = await userRepository.findById(session.userId);
  const res = await reuniaoRepository.confirmarPresenca({
    reuniaoId,
    condominiumId: session.condominiumId,
    userId: session.userId,
    nome: user?.name ?? "Morador",
    unidade: user?.unit ?? "",
  });
  return { ok: res === "ok" };
}
