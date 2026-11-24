// ---------------------------------------------------------------------------
// src/server/repositories/unidadeRepository.ts
//
// Repositório de Unidades (SÍN-021), SEMPRE escopado por condominiumId
// (isolamento multi-tenant). Requer `prisma generate` após o schema.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const unidadeRepository = {
  listByCondominium(condominiumId: string) {
    return prisma.unidade.findMany({
      where: { condominiumId },
      orderBy: [{ bloco: "asc" }, { numero: "asc" }],
    });
  },

  findById(id: string, condominiumId: string) {
    return prisma.unidade.findFirst({ where: { id, condominiumId } });
  },

  create(data: Prisma.UnidadeUncheckedCreateInput) {
    return prisma.unidade.create({ data });
  },

  /** Importação em massa (SÍN-021 Fase 2). skipDuplicates protege a unique. */
  createMany(data: Prisma.UnidadeUncheckedCreateInput[]) {
    return prisma.unidade.createMany({ data, skipDuplicates: true });
  },

  update(id: string, condominiumId: string, data: Prisma.UnidadeUncheckedUpdateInput) {
    return prisma.unidade.updateMany({ where: { id, condominiumId }, data });
  },

  remove(id: string, condominiumId: string) {
    return prisma.unidade.deleteMany({ where: { id, condominiumId } });
  },
};
