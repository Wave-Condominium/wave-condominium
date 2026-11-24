// ---------------------------------------------------------------------------
// src/server/repositories/receitaRepository.ts  —  MOR-057
//
// Receitas (cota condominial) originadas da confirmação do PSP, SEMPRE escopadas
// por condominiumId (isolamento multi-tenant). Requer `prisma generate`.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const receitaRepository = {
  findByBoleto(boletoId: string) {
    return prisma.receita.findUnique({ where: { boletoId } });
  },

  create(data: Prisma.ReceitaUncheckedCreateInput) {
    return prisma.receita.create({ data });
  },

  listByCondominium(condominiumId: string) {
    return prisma.receita.findMany({
      where: { condominiumId },
      orderBy: [{ referenceMonth: "desc" }, { dataPagamento: "desc" }],
    });
  },

  /** Receitas de uma unidade (a "minha cota" do morador). */
  listByUnit(condominiumId: string, unitNumber: string) {
    return prisma.receita.findMany({
      where: { condominiumId, unitNumber },
      orderBy: [{ referenceMonth: "desc" }, { dataPagamento: "desc" }],
    });
  },
};
