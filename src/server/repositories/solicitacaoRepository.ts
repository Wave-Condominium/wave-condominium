// ---------------------------------------------------------------------------
// src/server/repositories/solicitacaoRepository.ts
//
// Repositório de Solicitações de serviço/manutenção (SÍN-026), SEMPRE escopado
// por condominiumId (isolamento multi-tenant). Requer `prisma generate`.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const solicitacaoRepository = {
  listByCondominium(condominiumId: string) {
    return prisma.solicitacaoServico.findMany({
      where: { condominiumId },
      orderBy: { aberturaEm: "desc" },
    });
  },

  /** Solicitações abertas pelo próprio morador (identidade da sessão). */
  listBySolicitante(condominiumId: string, solicitanteId: string) {
    return prisma.solicitacaoServico.findMany({
      where: { condominiumId, solicitanteId },
      orderBy: { aberturaEm: "desc" },
    });
  },

  findById(id: string, condominiumId: string) {
    return prisma.solicitacaoServico.findFirst({ where: { id, condominiumId } });
  },

  create(data: Prisma.SolicitacaoServicoUncheckedCreateInput) {
    return prisma.solicitacaoServico.create({ data });
  },

  update(id: string, condominiumId: string, data: Prisma.SolicitacaoServicoUncheckedUpdateInput) {
    return prisma.solicitacaoServico.updateMany({ where: { id, condominiumId }, data });
  },
};
