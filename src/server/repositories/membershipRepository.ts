// ---------------------------------------------------------------------------
// src/server/repositories/membershipRepository.ts
//
// Repositório dos vínculos usuário↔condomínio (SÍN-031). Fonte de verdade do
// acesso multi-condomínio e do papel por condomínio. Requer `prisma generate`.
// ---------------------------------------------------------------------------

import type { Prisma, Role as PrismaRole } from "@prisma/client";
import { prisma } from "@/server/db";

export const membershipRepository = {
  /** Vínculos do usuário, com o condomínio (id + nome) para exibição no seletor. */
  listByUser(userId: string) {
    return prisma.condominiumMembership.findMany({
      where: { userId },
      include: { condominium: { select: { id: true, name: true } } },
      orderBy: { condominium: { name: "asc" } },
    });
  },

  /** Vínculo específico (para validar acesso a um condomínio no servidor). */
  findByUserAndCondominium(userId: string, condominiumId: string) {
    return prisma.condominiumMembership.findUnique({
      where: { userId_condominiumId: { userId, condominiumId } },
    });
  },

  /**
   * Garante o vínculo (idempotente): cria com o papel informado ou atualiza o
   * papel se o vínculo já existir. Usado no cadastro/ativação para manter o
   * modelo consistente (todo usuário de condomínio tem um membership).
   */
  upsert(userId: string, condominiumId: string, role: PrismaRole) {
    return prisma.condominiumMembership.upsert({
      where: { userId_condominiumId: { userId, condominiumId } },
      update: { role },
      create: { userId, condominiumId, role },
    });
  },

  create(data: Prisma.CondominiumMembershipUncheckedCreateInput) {
    return prisma.condominiumMembership.create({ data });
  },

  remove(userId: string, condominiumId: string) {
    return prisma.condominiumMembership.deleteMany({ where: { userId, condominiumId } });
  },
};
