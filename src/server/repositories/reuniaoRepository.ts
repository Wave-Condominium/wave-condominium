// ---------------------------------------------------------------------------
// src/server/repositories/reuniaoRepository.ts
//
// Repositório de Reuniões & Confirmações de presença (SÍN-026), SEMPRE escopado
// por condominiumId (isolamento multi-tenant). Requer `prisma generate`.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const reuniaoRepository = {
  /** Reuniões do condomínio, com a contagem de confirmações (participantes). */
  listByCondominium(condominiumId: string) {
    return prisma.reuniao.findMany({
      where: { condominiumId },
      orderBy: [{ data: "desc" }, { horario: "desc" }],
      include: { _count: { select: { confirmacoes: true } } },
    });
  },

  findById(id: string, condominiumId: string) {
    return prisma.reuniao.findFirst({ where: { id, condominiumId } });
  },

  create(data: Prisma.ReuniaoUncheckedCreateInput) {
    return prisma.reuniao.create({ data });
  },

  update(id: string, condominiumId: string, data: Prisma.ReuniaoUncheckedUpdateInput) {
    return prisma.reuniao.updateMany({ where: { id, condominiumId }, data });
  },

  /**
   * Remove uma reunião (escopado por condomínio). Usado para descartar um
   * rascunho de convocação rejeitado na Central (SÍN-026). Confirmações são
   * removidas em cascata (onDelete: Cascade) — rascunhos não têm confirmações.
   */
  remove(id: string, condominiumId: string) {
    return prisma.reuniao.deleteMany({ where: { id, condominiumId } });
  },

  // --- Confirmações de presença (MOR-032) ------------------------------------

  /** Todas as confirmações do condomínio (para exibição/contagem na UI). */
  listConfirmacoesByCondominium(condominiumId: string) {
    return prisma.confirmacaoPresenca.findMany({
      where: { condominiumId },
      orderBy: { confirmadoEm: "asc" },
    });
  },

  /** Registra a confirmação (idempotente por usuário/reunião via unique). */
  async confirmarPresenca(data: {
    reuniaoId: string;
    condominiumId: string;
    userId: string;
    nome: string;
    unidade: string;
  }): Promise<"ok" | "ja_confirmou"> {
    try {
      await prisma.confirmacaoPresenca.create({ data });
      return "ok";
    } catch {
      // Violação do unique (reuniaoId, userId) => já confirmou.
      return "ja_confirmou";
    }
  },
};
