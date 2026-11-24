import { prisma } from "@/server/db";
import type { TipoAlertaSeguranca } from "@/server/security/anomalia";
import type { EscopoConsultaEventos } from "@/server/security/eventoSeguranca";
import type { Prisma } from "@prisma/client";

export interface CriarAlertaInput {
  tipo: TipoAlertaSeguranca;
  descricao: string;
  contagem: number;
  userId?: string | null;
  email?: string | null;
  condominiumId?: string | null;
  ip?: string | null;
}

export interface ListarAlertasFiltro {
  escopo: EscopoConsultaEventos;
  apenasAbertos?: boolean;
  page?: number;
  pageSize?: number;
}

/** Monta o filtro por escopo — mesma regra usada em eventoSegurancaRepository. */
async function whereDoEscopo(
  escopo: EscopoConsultaEventos
): Promise<Prisma.AlertaSegurancaWhereInput> {
  if (escopo.tipo === "CONDOMINIO") return { condominiumId: escopo.condominiumId };
  if (escopo.tipo === "ADMINISTRADORA") {
    const condominios = await prisma.condominium.findMany({
      where: { administradoraId: escopo.administradoraId },
      select: { id: true },
    });
    return { condominiumId: { in: condominios.map((c) => c.id) } };
  }
  return {};
}

export const alertaSegurancaRepository = {
  async criar(input: CriarAlertaInput) {
    return prisma.alertaSeguranca.create({
      data: {
        tipo: input.tipo,
        descricao: input.descricao,
        contagem: input.contagem,
        userId: input.userId ?? null,
        email: input.email ?? null,
        condominiumId: input.condominiumId ?? null,
        ip: input.ip ?? null,
      },
    });
  },

  /**
   * Último alerta ABERTO (não resolvido) do mesmo tipo + mesma "chave"
   * (e-mail, IP ou userId, dependendo da regra) — usado só para checar
   * cooldown, nunca para exibição.
   */
  async buscarUltimoAberto(where: Prisma.AlertaSegurancaWhereInput) {
    return prisma.alertaSeguranca.findFirst({
      where: { ...where, resolvidoEm: null },
      orderBy: { createdAt: "desc" },
    });
  },

  async listar({ escopo, apenasAbertos = false, page = 1, pageSize = 50 }: ListarAlertasFiltro) {
    if (escopo.tipo === "NEGADO") {
      throw new Error("Escopo negado — chamador deveria ter barrado antes de chegar aqui.");
    }
    const where: Prisma.AlertaSegurancaWhereInput = {
      ...(await whereDoEscopo(escopo)),
      ...(apenasAbertos ? { resolvidoEm: null } : {}),
    };

    const [itens, total] = await Promise.all([
      prisma.alertaSeguranca.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.alertaSeguranca.count({ where }),
    ]);
    return { itens, total, page, pageSize };
  },

  /** Contagem de abertos — alimenta o badge do menu (SÍN-026, mesmo padrão). */
  async contarAbertos(escopo: EscopoConsultaEventos): Promise<number> {
    if (escopo.tipo === "NEGADO") return 0;
    const where: Prisma.AlertaSegurancaWhereInput = {
      ...(await whereDoEscopo(escopo)),
      resolvidoEm: null,
    };
    return prisma.alertaSeguranca.count({ where });
  },

  async resolver(id: string, resolvidoPorId: string) {
    return prisma.alertaSeguranca.update({
      where: { id },
      data: { resolvidoEm: new Date(), resolvidoPorId },
    });
  },
};
