"use server";

// ---------------------------------------------------------------------------
// src/app/actions/unidades.ts
//
// Server Actions de Unidades (SÍN-021) sobre PostgreSQL.
//
// Segurança (validada NO SERVIDOR): leitura exige sessão; criar/editar/excluir
// exigem gestão (requireManager). Tudo escopado por session.condominiumId — um
// condomínio nunca vê/edita unidade de outro (multi-tenant).
//
// Deduplicação: a unicidade (condominiumId, bloco, numero) do banco impede
// unidades duplicadas; o erro P2002 do Prisma é traduzido para uma mensagem
// clara ao usuário.
//
// Requer `prisma generate` após o schema (model Unidade e enums).
// ---------------------------------------------------------------------------

import { requireSession, requireManager } from "@/server/auth/guard";
import { unidadeRepository } from "@/server/repositories/unidadeRepository";
import { validarUnidade, type Unidade, type UnidadeInput } from "@/components/units/unidades";

function toApp(u: any): Unidade {
  return {
    id: u.id,
    bloco: u.bloco ?? "",
    andar: u.andar ?? "",
    numero: u.numero,
    tipo: u.tipo,
    fracaoIdeal: u.fracaoIdeal != null ? Number(u.fracaoIdeal) : undefined,
    areaPrivativa: u.areaPrivativa != null ? Number(u.areaPrivativa) : undefined,
    vagas: u.vagas ?? 0,
    status: u.status,
    proprietarioNome: u.proprietarioNome ?? undefined,
    proprietarioEmail: u.proprietarioEmail ?? undefined,
    proprietarioTelefone: u.proprietarioTelefone ?? undefined,
    inquilinoNome: u.inquilinoNome ?? undefined,
    inquilinoEmail: u.inquilinoEmail ?? undefined,
    inquilinoTelefone: u.inquilinoTelefone ?? undefined,
    criadoEm: new Date(u.criadoEm).toISOString(),
    atualizadoEm: new Date(u.atualizadoEm).toISOString(),
  };
}

export type UnidadeResult =
  | { ok: true; unidade: Unidade }
  | { ok: false; error: string };

const ERRO_DUPLICADA = "Já existe uma unidade com esse bloco e número.";

function isUniqueViolation(e: any): boolean {
  return e?.code === "P2002";
}

/** Campos cadastrais → linha do banco (normaliza vazios). */
function toRow(input: UnidadeInput) {
  const txt = (v?: string) => (v && v.trim() ? v.trim() : null);
  return {
    bloco: (input.bloco ?? "").trim(),
    andar: (input.andar ?? "").trim(),
    numero: input.numero.trim(),
    tipo: input.tipo,
    fracaoIdeal: input.fracaoIdeal ?? null,
    areaPrivativa: input.areaPrivativa ?? null,
    vagas: input.vagas ?? 0,
    status: input.status,
    proprietarioNome: txt(input.proprietarioNome),
    proprietarioEmail: txt(input.proprietarioEmail),
    proprietarioTelefone: txt(input.proprietarioTelefone),
    inquilinoNome: txt(input.inquilinoNome),
    inquilinoEmail: txt(input.inquilinoEmail),
    inquilinoTelefone: txt(input.inquilinoTelefone),
  };
}

// --- Leitura -----------------------------------------------------------------

/** Lista as unidades do condomínio ativo (qualquer usuário autenticado). */
export async function listUnidadesAction(): Promise<Unidade[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];
  const rows = await unidadeRepository.listByCondominium(session.condominiumId);
  return rows.map(toApp);
}

// --- Criação (gestor) --------------------------------------------------------

export async function criarUnidadeAction(input: UnidadeInput): Promise<UnidadeResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const erro = validarUnidade(input);
  if (erro) return { ok: false, error: erro };

  try {
    const row = await unidadeRepository.create({ condominiumId: session.condominiumId, ...toRow(input) });
    return { ok: true, unidade: toApp(row) };
  } catch (e: any) {
    if (isUniqueViolation(e)) return { ok: false, error: ERRO_DUPLICADA };
    console.error("[SÍN-021] Falha ao criar unidade", e);
    return { ok: false, error: "Não foi possível cadastrar a unidade." };
  }
}

// --- Edição (gestor) ---------------------------------------------------------

export async function atualizarUnidadeAction(id: string, input: UnidadeInput): Promise<UnidadeResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const erro = validarUnidade(input);
  if (erro) return { ok: false, error: erro };

  const existente = await unidadeRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Unidade não encontrada." };

  try {
    await unidadeRepository.update(id, session.condominiumId, toRow(input));
  } catch (e: any) {
    if (isUniqueViolation(e)) return { ok: false, error: ERRO_DUPLICADA };
    console.error("[SÍN-021] Falha ao atualizar unidade", e);
    return { ok: false, error: "Não foi possível atualizar a unidade." };
  }

  const atualizada = await unidadeRepository.findById(id, session.condominiumId);
  return atualizada
    ? { ok: true, unidade: toApp(atualizada) }
    : { ok: false, error: "Não foi possível atualizar a unidade." };
}

// --- Atualização de status (gestor) -----------------------------------------

export async function atualizarStatusUnidadeAction(
  id: string,
  status: Unidade["status"],
): Promise<UnidadeResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const existente = await unidadeRepository.findById(id, session.condominiumId);
  if (!existente) return { ok: false, error: "Unidade não encontrada." };

  await unidadeRepository.update(id, session.condominiumId, { status });

  const atualizada = await unidadeRepository.findById(id, session.condominiumId);
  return atualizada
    ? { ok: true, unidade: toApp(atualizada) }
    : { ok: false, error: "Não foi possível atualizar o status." };
}

// --- Exclusão (gestor) -------------------------------------------------------

export async function removerUnidadeAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  await unidadeRepository.remove(id, session.condominiumId);
  return { ok: true };
}
