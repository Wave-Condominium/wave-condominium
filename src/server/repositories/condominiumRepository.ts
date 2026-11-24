// ---------------------------------------------------------------------------
// src/server/repositories/condominiumRepository.ts
//
// Repositorio dos condominios sob uma Administradora (canal B2B2C
// multi-condominio). Fornece a listagem escopada por administradora, a
// verificacao de vinculo (isolamento multi-tenant) e as metricas usadas no
// painel consolidado.
//
// Requer `prisma generate` (models Condominium/Administradora).
// ---------------------------------------------------------------------------

import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { formatCNPJ } from "@/lib/validators";

export interface CondominioMetrics {
  totalMoradores: number;
  boletosEmAberto: number;
  propostasAtivas: number;
}

export const condominiumRepository = {
  // SÍN-030 (onboarding) --------------------------------------------------------

  /** Cria a entidade Condomínio (onboarding). CNPJ deve vir normalizado (dígitos). */
  create(data: Prisma.CondominiumUncheckedCreateInput) {
    return prisma.condominium.create({ data });
  },

  /**
   * Busca por CNPJ aceitando as duas grafias (só dígitos ou formatado) — base da
   * regra "1 CNPJ = 1 condomínio", robusta contra dados legados formatados.
   */
  findByCnpjEquivalente(cnpjDigits: string) {
    const formatado = formatCNPJ(cnpjDigits);
    return prisma.condominium.findFirst({
      where: { cnpj: { in: [cnpjDigits, formatado] } },
      select: { id: true, name: true },
    });
  },

  /** Atualiza o estado do vínculo com o PSP (subconta/KYC). */
  updatePsp(
    condominiumId: string,
    data: { pspSubcontaId?: string; pspStatus?: string; pspAtualizadoEm?: Date; pspMotivoRecusa?: string | null },
  ) {
    return prisma.condominium.update({
      where: { id: condominiumId },
      data: data as Prisma.CondominiumUncheckedUpdateInput,
    });
  },

  /** Lista os condominios geridos por uma administradora (ordem alfabetica). */
  listByAdministradora(administradoraId: string) {
    return prisma.condominium.findMany({
      where: { administradoraId },
      orderBy: { name: "asc" },
    });
  },

  /**
   * Confirma que o condominio pertence a administradora informada.
   * Base do isolamento multi-tenant ao selecionar o condominio ativo.
   */
  belongsToAdministradora(condominiumId: string, administradoraId: string) {
    return prisma.condominium.findFirst({
      where: { id: condominiumId, administradoraId },
      select: { id: true },
    });
  },

  findById(condominiumId: string) {
    return prisma.condominium.findUnique({ where: { id: condominiumId } });
  },

  // SÍN-026 (financeiro): alçada de aprovação de despesas.

  /** Lê a alçada de aprovação (null = sem alçada configurada). */
  async getAlcada(condominiumId: string): Promise<number | null> {
    const c = await prisma.condominium.findUnique({
      where: { id: condominiumId },
      select: { alcadaAprovacao: true },
    });
    return c && c.alcadaAprovacao != null ? Number(c.alcadaAprovacao) : null;
  },

  /** Define (valor) ou limpa (null) a alçada de aprovação. */
  setAlcada(condominiumId: string, valor: number | null) {
    return prisma.condominium.update({
      where: { id: condominiumId },
      data: { alcadaAprovacao: valor },
    });
  },

  /** Metricas agregadas de um condominio para o painel da administradora. */
  async metrics(condominiumId: string): Promise<CondominioMetrics> {
    const [totalMoradores, boletosEmAberto, propostasAtivas] = await Promise.all([
      prisma.user.count({ where: { condominiumId, role: "MORADOR" } }),
      prisma.boleto.count({
        where: { condominiumId, status: { in: ["PENDING", "OVERDUE"] } },
      }),
      prisma.proposta.count({
        where: { condominiumId, status: "VOTACAO_ABERTA" },
      }),
    ]);
    return { totalMoradores, boletosEmAberto, propostasAtivas };
  },
};
