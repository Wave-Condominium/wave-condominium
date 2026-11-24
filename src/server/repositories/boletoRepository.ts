// ---------------------------------------------------------------------------
// src/server/repositories/boletoRepository.ts
//
// Repositorio de Boletos, escopado por condominiumId.
// Requer `prisma generate` apos o schema (model Boleto).
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";

export const boletoRepository = {
  listByCondominium(condominiumId: string) {
    return prisma.boleto.findMany({ where: { condominiumId }, orderBy: { issuedAt: "desc" } });
  },

  findById(id: string, condominiumId: string) {
    return prisma.boleto.findFirst({ where: { id, condominiumId } });
  },

  create(data: Prisma.BoletoUncheckedCreateInput) {
    return prisma.boleto.create({ data });
  },

  update(id: string, condominiumId: string, data: Prisma.BoletoUncheckedUpdateInput) {
    return prisma.boleto.updateMany({ where: { id, condominiumId }, data });
  },

  /** SÍN-009: registra o envio de um lembrete de cobrança ao morador. */
  marcarLembrete(id: string, condominiumId: string, at: Date) {
    return prisma.boleto.updateMany({ where: { id, condominiumId }, data: { lastReminderAt: at } });
  },

  /** SÍN-009: registra um acordo de parcelamento (registro leve no boleto). */
  registrarAcordo(
    id: string,
    condominiumId: string,
    data: {
      acordoParcelas: number;
      acordoPrimeiraParcela: string;
      acordoObservacao: string | null;
      acordoRegistradoEm: Date;
      acordoRegistradoPor: string;
    },
  ) {
    return prisma.boleto.updateMany({ where: { id, condominiumId }, data });
  },
};
