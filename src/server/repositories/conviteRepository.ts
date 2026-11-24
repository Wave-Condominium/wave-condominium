// ---------------------------------------------------------------------------
// src/server/repositories/conviteRepository.ts
//
// Repositório de Convites de Acesso (SÍN-022). As operações de GESTÃO são
// SEMPRE escopadas por condominiumId (isolamento multi-tenant). A ÚNICA
// operação global é `findByTokenHash`, usada na ativação pública (o token é o
// portador da autorização) — e ainda assim devolve o condominiumId do convite.
//
// Requer `prisma generate` após o schema (model ConviteAcesso + enums).
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const conviteRepository = {
  listByCondominium(condominiumId: string) {
    return prisma.conviteAcesso.findMany({
      where: { condominiumId },
      orderBy: { criadoEm: "desc" },
    });
  },

  listByUnidade(condominiumId: string, unidadeId: string) {
    return prisma.conviteAcesso.findMany({
      where: { condominiumId, unidadeId },
      orderBy: { criadoEm: "desc" },
    });
  },

  findById(id: string, condominiumId: string) {
    return prisma.conviteAcesso.findFirst({ where: { id, condominiumId } });
  },

  /** Ativação pública: localiza pelo hash do token (global, sem escopo). */
  findByTokenHash(tokenHash: string) {
    return prisma.conviteAcesso.findUnique({ where: { tokenHash } });
  },

  /** Convite não-revogado/não-ativado ainda em aberto para o mesmo e-mail+unidade. */
  findAbertoByEmailUnidade(condominiumId: string, email: string, unidadeId: string | null) {
    return prisma.conviteAcesso.findFirst({
      where: { condominiumId, email, unidadeId, status: "PENDENTE" },
      orderBy: { criadoEm: "desc" },
    });
  },

  /**
   * SÍN-022 Fase 2: convites AINDA VÁLIDOS (pendentes ou ativados) de uma
   * unidade para um vínculo específico — os "anteriores" a revogar numa
   * transferência de titularidade (PROPRIETARIO) ou nova locação (INQUILINO).
   */
  listAtivosByUnidadeVinculo(condominiumId: string, unidadeId: string, vinculo: "PROPRIETARIO" | "INQUILINO" | "DEPENDENTE") {
    return prisma.conviteAcesso.findMany({
      where: { condominiumId, unidadeId, vinculo, status: { in: ["PENDENTE", "ATIVADO"] } },
      orderBy: { criadoEm: "desc" },
    });
  },

  create(data: Prisma.ConviteAcessoUncheckedCreateInput) {
    return prisma.conviteAcesso.create({ data });
  },

  /** Reenvio: rota novo token/expiração mantendo o convite (escopo garantido). */
  atualizarToken(id: string, condominiumId: string, tokenHash: string, expiresAt: Date) {
    return prisma.conviteAcesso.updateMany({
      where: { id, condominiumId, status: "PENDENTE" },
      data: { tokenHash, expiresAt },
    });
  },

  /** Ativação: uso único — só transita de PENDENTE para ATIVADO. */
  marcarAtivado(id: string, usuarioId: string) {
    return prisma.conviteAcesso.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "ATIVADO", usuarioId, usadoEm: new Date() },
    });
  },

  /** Revogação (escopada). Bloqueia reuso e registra responsável/momento. */
  marcarRevogado(id: string, condominiumId: string, revogadoPor: string) {
    return prisma.conviteAcesso.updateMany({
      where: { id, condominiumId },
      data: { status: "REVOGADO", revogadoEm: new Date(), revogadoPor },
    });
  },
};
