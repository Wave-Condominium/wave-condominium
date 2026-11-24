import { prisma } from "@/server/db";
import type { Role as PrismaRole } from "@prisma/client";

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role: PrismaRole;
  unit?: string | null;
  photoUrl?: string | null;
  condominiumId: string;
  mustChangePassword?: boolean;
}

export const userRepository = {
  // NOTA multi-tenant: por ora busca so por e-mail (fase de 1 condominio).
  // Quando houver varios condominios, o login precisa de subdominio/seletor
  // para desambiguar, pois e-mail e unico apenas POR condominio.
  findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase().trim() },
    });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  /** Usuário por e-mail DENTRO de um condomínio (e-mail é único por condomínio). */
  findByEmailInCondominium(email: string, condominiumId: string) {
    return prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), condominiumId },
    });
  },

  create(data: CreateUserInput) {
    return prisma.user.create({
      data: { ...data, email: data.email.toLowerCase().trim() },
    });
  },

  /** Atualiza hash da senha e limpa flag de primeiro acesso. */
  async updatePassword(userId: string, passwordHash: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  },

  // SÍN-022: revogação de acesso. Como o JWT é stateless, a revogação é
  // aplicada por esta flag no User, verificada no login/guard/getCurrentUser.

  /** Marca (ou desmarca) o acesso como revogado. */
  setAcessoRevogado(userId: string, revogado: boolean) {
    return prisma.user.update({
      where: { id: userId },
      data: { acessoRevogado: revogado },
    });
  },

  /**
   * SÍN-022: reativa (ou ativa) um Morador existente definindo a nova senha
   * escolhida por ele na ativação. Limpa a revogação e o primeiro-acesso e
   * sincroniza nome/unidade com os dados do convite.
   */
  reativarMoradorComSenha(
    userId: string,
    data: { passwordHash: string; name: string; unit?: string | null },
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: data.passwordHash,
        name: data.name,
        unit: data.unit ?? null,
        mustChangePassword: false,
        acessoRevogado: false,
      },
    });
  },

  /** Leitura leve p/ o guard: apenas o estado de revogação. Null se inexistente. */
  async isAcessoRevogado(userId: string): Promise<boolean | null> {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { acessoRevogado: true },
    });
    return u ? u.acessoRevogado : null;
  },
};