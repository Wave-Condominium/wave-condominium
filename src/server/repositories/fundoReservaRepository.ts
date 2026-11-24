// ---------------------------------------------------------------------------
// src/server/repositories/fundoReservaRepository.ts  —  MOR-023
//
// Conexão Open Finance (uma por condomínio) e snapshots do Fundo de Reserva,
// SEMPRE escopados por condominiumId (isolamento multi-tenant). Requer
// `prisma generate`.
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const fundoReservaRepository = {
  // --- Conexão / consentimento -----------------------------------------------

  getConexao(condominiumId: string) {
    return prisma.fundoReservaConexao.findUnique({ where: { condominiumId } });
  },

  upsertConexao(
    condominiumId: string,
    data: Omit<Prisma.FundoReservaConexaoUncheckedCreateInput, "condominiumId">,
  ) {
    return prisma.fundoReservaConexao.upsert({
      where: { condominiumId },
      update: data as Prisma.FundoReservaConexaoUncheckedUpdateInput,
      create: { condominiumId, ...data },
    });
  },

  updateConexaoStatus(condominiumId: string, data: Prisma.FundoReservaConexaoUncheckedUpdateInput) {
    return prisma.fundoReservaConexao.updateMany({ where: { condominiumId }, data });
  },

  // --- Snapshots -------------------------------------------------------------

  createSnapshot(data: Prisma.FundoReservaSnapshotUncheckedCreateInput) {
    return prisma.fundoReservaSnapshot.create({ data });
  },

  /** Último snapshot do condomínio (o exibido no Dashboard). */
  latestSnapshot(condominiumId: string) {
    return prisma.fundoReservaSnapshot.findFirst({
      where: { condominiumId },
      orderBy: { consultadoEm: "desc" },
    });
  },
};
