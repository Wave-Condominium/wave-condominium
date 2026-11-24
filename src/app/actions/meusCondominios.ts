"use server";

// ---------------------------------------------------------------------------
// src/app/actions/meusCondominios.ts
//
// Seletor de condomínio ativo para usuários com vínculo em MAIS DE UM condomínio
// (SÍN-031) — ex.: síndico profissional. Reusa o padrão da Administradora: ao
// selecionar, REEMITIMOS a sessão com o `condominiumId` escolhido E o papel do
// usuário NAQUELE condomínio; como todas as actions de domínio já leem
// `session.condominiumId`/`session.role`, o contexto troca sem mudar nada nelas.
//
// Segurança (validada NO SERVIDOR): a troca só é aceita se existir um VÍNCULO do
// usuário com o condomínio (nunca confia no id vindo da interface).
// ---------------------------------------------------------------------------

import { requireSession } from "@/server/auth/guard";
import { createSession } from "@/server/auth/session";
import { membershipRepository } from "@/server/repositories/membershipRepository";
import type { Role as PrismaRole } from "@prisma/client";
import type { Role } from "@/lib/rbac";

const DB_TO_LABEL: Record<PrismaRole, Role> = {
  ADMIN: "Admin",
  ADMINISTRADORA: "Administradora",
  SINDICO: "Síndico",
  CONSELHO: "Conselho",
  MORADOR: "Morador",
};

export interface MeuCondominio {
  id: string;
  name: string;
  /** Papel do usuário NESTE condomínio. */
  role: Role;
  ativo: boolean;
}

export interface MeusCondominiosResult {
  /** Só há o que trocar quando >= 2. */
  condominios: MeuCondominio[];
  ativoId: string | null;
}

/** Lista os condomínios aos quais o usuário tem vínculo, marcando o ativo. */
export async function meusCondominiosAction(): Promise<MeusCondominiosResult> {
  const session = await requireSession();
  const rows = await membershipRepository.listByUser(session.userId);
  const condominios: MeuCondominio[] = rows.map((m: any) => ({
    id: m.condominiumId,
    name: m.condominium?.name ?? "",
    role: DB_TO_LABEL[m.role as PrismaRole],
    ativo: m.condominiumId === session.condominiumId,
  }));
  return { condominios, ativoId: session.condominiumId };
}

export type SelecionarResult = { ok: true; role: Role } | { ok: false; error: string };

/**
 * Seleciona o condomínio ativo do usuário (reemite a sessão com o condomínio E o
 * papel dele nesse condomínio). Só permite se houver vínculo — barreira de
 * isolamento multi-tenant validada no servidor.
 */
export async function selecionarMeuCondominioAction(condominiumId: string): Promise<SelecionarResult> {
  const session = await requireSession();
  const vinculo = await membershipRepository.findByUserAndCondominium(session.userId, condominiumId);
  if (!vinculo) return { ok: false, error: "Você não tem acesso a este condomínio." };

  const role = DB_TO_LABEL[(vinculo as any).role as PrismaRole];
  await createSession({
    userId: session.userId,
    role,
    condominiumId,
    administradoraId: session.administradoraId ?? null,
  });
  return { ok: true, role };
}
