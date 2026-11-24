import { prisma } from "@/server/db";
import type {
  TipoEventoSeguranca as PrismaTipoEventoSeguranca,
  ResultadoEventoSeguranca as PrismaResultadoEventoSeguranca,
  Prisma,
} from "@prisma/client";
import type { EscopoConsultaEventos } from "@/server/security/eventoSeguranca";

export interface RegistrarEventoInput {
  tipo: PrismaTipoEventoSeguranca;
  resultado: PrismaResultadoEventoSeguranca;
  userId?: string | null;
  email?: string | null;
  condominiumId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  recurso?: string | null;
  metadata?: Prisma.InputJsonValue | null;
}

export interface ListarEventosFiltro {
  escopo: EscopoConsultaEventos;
  page?: number;
  pageSize?: number;
}

export const eventoSegurancaRepository = {
  /**
   * Grava um evento de segurança. Nunca lança para o chamador em caso de
   * falha de escrita — quem chama (registrarEventoSeguranca) decide como
   * tratar, mas a intenção é NUNCA travar o fluxo de negócio (ex.: um login
   * bem-sucedido não pode falhar por causa de um problema ao gravar o log).
   */
  async registrar(input: RegistrarEventoInput) {
    return prisma.eventoSeguranca.create({
      data: {
        tipo: input.tipo,
        resultado: input.resultado,
        userId: input.userId ?? null,
        email: input.email ?? null,
        condominiumId: input.condominiumId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
        recurso: input.recurso ?? null,
        metadata: input.metadata ?? undefined,
      },
    });
  },

  /**
   * Lista eventos já filtrados pelo escopo resolvido no servidor
   * (resolverEscopoConsulta) — nunca aceita um condominiumId vindo direto
   * do cliente sem passar por essa resolução.
   */
  async listar({ escopo, page = 1, pageSize = 50 }: ListarEventosFiltro) {
    if (escopo.tipo === "NEGADO") {
      throw new Error("Escopo negado — chamador deveria ter barrado antes de chegar aqui.");
    }

    let where: Prisma.EventoSegurancaWhereInput = {};
    if (escopo.tipo === "CONDOMINIO") {
      where = { condominiumId: escopo.condominiumId };
    } else if (escopo.tipo === "ADMINISTRADORA") {
      // A Administradora vê os condomínios que ELA GERE, não a plataforma
      // inteira — resolvido aqui (não é lógica pura, depende do banco).
      const condominios = await prisma.condominium.findMany({
        where: { administradoraId: escopo.administradoraId },
        select: { id: true },
      });
      const ids = condominios.map((c) => c.id);
      // Sem condomínio nenhum sob gestão: retorna vazio, não erro — é um
      // resultado legítimo (Administradora recém-criada, por exemplo).
      where = { condominiumId: { in: ids } };
    }

    const [itens, total] = await Promise.all([
      prisma.eventoSeguranca.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.eventoSeguranca.count({ where }),
    ]);

    return { itens, total, page, pageSize };
  },

  /** Quantas LOGIN_FALHA para o mesmo e-mail, desde um instante. */
  async contarFalhasLoginPorEmail(email: string, desde: Date): Promise<number> {
    return prisma.eventoSeguranca.count({
      where: { tipo: "LOGIN_FALHA", email, timestamp: { gte: desde } },
    });
  },

  /** Quantos e-mails DISTINTOS tentaram (e falharam) login pelo mesmo IP, desde um instante. */
  async contarEmailsDistintosPorIpFalhaLogin(ip: string, desde: Date): Promise<number> {
    const linhas = await prisma.eventoSeguranca.findMany({
      where: { tipo: "LOGIN_FALHA", ip, timestamp: { gte: desde }, email: { not: null } },
      distinct: ["email"],
      select: { email: true },
    });
    return linhas.length;
  },

  /** Quantos ACESSO_NEGADO para o mesmo usuário, desde um instante. */
  async contarAcessosNegadosPorUsuario(userId: string, desde: Date): Promise<number> {
    return prisma.eventoSeguranca.count({
      where: { tipo: "ACESSO_NEGADO", userId, timestamp: { gte: desde } },
    });
  },

  /**
   * Expurgo de retenção (SEG-016 Fase 2): remove eventos mais antigos que a
   * data de corte. Chamado pelo cron diário (ver
   * src/app/api/cron/purge-eventos-seguranca/route.ts) — nunca pelo cliente.
   */
  async expurgarAntigos(dataCorte: Date): Promise<number> {
    const { count } = await prisma.eventoSeguranca.deleteMany({
      where: { timestamp: { lt: dataCorte } },
    });
    return count;
  },
};
