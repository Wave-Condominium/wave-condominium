// ---------------------------------------------------------------------------
// src/server/repositories/despesaRepository.ts
//
// Repositório de Despesas (SÍN-011), SEMPRE escopado por condominiumId
// (isolamento multi-tenant). Requer `prisma generate` após o schema
// (model Despesa + enums).
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const despesaRepository = {
  listByCondominium(condominiumId: string) {
    return prisma.despesa.findMany({
      where: { condominiumId },
      orderBy: { criadoEm: "desc" },
    });
  },

  findById(id: string, condominiumId: string) {
    return prisma.despesa.findFirst({ where: { id, condominiumId } });
  },

  create(data: Prisma.DespesaUncheckedCreateInput) {
    return prisma.despesa.create({ data });
  },

  update(id: string, condominiumId: string, data: Prisma.DespesaUncheckedUpdateInput) {
    return prisma.despesa.updateMany({ where: { id, condominiumId }, data });
  },
};
