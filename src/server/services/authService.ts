import { userRepository } from "@/server/repositories/userRepository";
import { membershipRepository } from "@/server/repositories/membershipRepository";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession, getSession } from "@/server/auth/session";
import type { Role } from "@/lib/rbac";
import {
  papeisNoCondominio,
  resolverCondominioAtivo,
  type CondominioMembership,
} from "@/lib/memberships";
import type { Role as PrismaRole } from "@prisma/client";
import { registrarEventoSeguranca } from "@/server/security/registrarEventoSeguranca";

// Ponto UNICO de conversao entre o enum do banco e o rotulo do app.
// Mantido aqui para nao recriar o bug de grafia que o rbac.ts eliminou.
const DB_TO_LABEL: Record<PrismaRole, Role> = {
  ADMIN: "Admin",
  ADMINISTRADORA: "Administradora",
  SINDICO: "Síndico",
  CONSELHO: "Conselho",
  MORADOR: "Morador",
};
const LABEL_TO_DB: Record<Role, PrismaRole> = {
  Admin: "ADMIN",
  Administradora: "ADMINISTRADORA",
  "Síndico": "SINDICO",
  Conselho: "CONSELHO",
  Morador: "MORADOR",
};

/** Carrega os vínculos do usuário em rótulos de app (SÍN-031). */
async function carregarMemberships(userId: string): Promise<CondominioMembership[]> {
  const rows = await membershipRepository.listByUser(userId);
  return rows.map((m: any) => ({
    condominiumId: m.condominiumId,
    condominiumName: m.condominium?.name ?? "",
    role: DB_TO_LABEL[m.role as PrismaRole],
  }));
}

/**
 * Perfis disponíveis no condomínio ATIVO (SÍN-031 + SÍN-003): papel do vínculo
 * naquele condomínio (fallback: papel de cadastro) + papel secundário somente
 * quando o condomínio ativo é o "home" do usuário.
 */
function availableRolesForCondo(
  u: DbUser,
  memberships: CondominioMembership[],
  activeCondominiumId: string | null,
): Role[] {
  const doVinculo = memberships.find((m) => m.condominiumId === activeCondominiumId)?.role ?? null;
  const secundario = u.secondaryRole ? DB_TO_LABEL[u.secondaryRole] : null;
  const ehHome = !!activeCondominiumId && activeCondominiumId === u.condominiumId;
  return papeisNoCondominio(doVinculo, DB_TO_LABEL[u.role], secundario, ehHome);
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  /** Perfil ATIVO da sessão (pode diferir do papel de cadastro em usuários duais). */
  role: Role;
  /** Perfis que o usuário pode assumir (SÍN-003). */
  availableRoles: Role[];
  unit: string | null;
  photoUrl: string | null;
  condominiumId: string | null;
  administradoraId: string | null;
  mustChangePassword: boolean;
}

// Tipo alinhado ao Prisma User — campos opcionais (mustChangePassword,
// secondaryRole) podem ainda nao existir no banco (migration pendente) ou ser
// undefined em registros antigos.
type DbUser = {
  id: string; email: string; name: string; role: PrismaRole;
  secondaryRole?: PrismaRole | null;
  unit: string | null; photoUrl: string | null;
  condominiumId: string | null; administradoraId: string | null;
  mustChangePassword?: boolean;
  acessoRevogado?: boolean;
};

// `activeRole` é o perfil ATIVO da sessão; quando ausente, usa o papel de
// cadastro. `availableRoles` e `condominiumId` refletem o condomínio ATIVO
// (SÍN-031); quando ausentes, caem no papel/condomínio de cadastro.
function toPublic(
  u: DbUser,
  activeRole?: Role,
  availableRoles?: Role[],
  activeCondominiumId?: string | null,
): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: activeRole ?? DB_TO_LABEL[u.role],
    availableRoles: availableRoles ?? [activeRole ?? DB_TO_LABEL[u.role]],
    unit: u.unit,
    photoUrl: u.photoUrl,
    condominiumId: activeCondominiumId !== undefined ? activeCondominiumId : u.condominiumId,
    administradoraId: u.administradoraId,
    mustChangePassword: u.mustChangePassword ?? false,
  };
}

export type LoginResult =
  | { ok: true; user: PublicUser; needsProfileChoice: boolean }
  | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await userRepository.findByEmail(email);
  // verifyPassword roda mesmo sem user (dummy hash) para nao vazar por timing.
  const valid = await verifyPassword(user?.passwordHash, password);
  if (!user || !valid) {
    // SEG-016: userId fica nulo quando o e-mail não existe (não revelamos
    // se a conta existe); quando existe mas a senha está errada, guardamos o
    // userId — é justamente o padrão de "várias falhas na mesma conta" que a
    // detecção de anomalia (fase futura) precisa enxergar.
    //
    // BUG corrigido: condominiumId também precisa ser preenchido quando o
    // usuário existe. Sem isso, a falha ficava com condominiumId nulo e
    // desaparecia da consulta do Síndico (que filtra "meu condomínio" — um
    // registro nulo nunca bate nesse filtro). Só o Admin de plataforma
    // (sem filtro) enxergava. Para e-mail inexistente, condominiumId
    // continua nulo mesmo (não há como saber de qual condomínio seria).
    await registrarEventoSeguranca({
      tipo: "LOGIN_FALHA",
      resultado: "FALHA",
      userId: user?.id ?? null,
      email,
      condominiumId: user?.condominiumId ?? null,
      recurso: "auth.login",
    });
    return { ok: false, error: "E-mail ou senha invalidos." };
  }

  // SÍN-022: acesso revogado pelo síndico bloqueia o login (verificado só após
  // credenciais válidas, para não revelar existência de conta a terceiros).
  if (user.acessoRevogado) {
    await registrarEventoSeguranca({
      tipo: "LOGIN_FALHA",
      resultado: "FALHA",
      userId: user.id,
      email,
      condominiumId: user.condominiumId ?? null,
      recurso: "auth.login",
      metadata: { motivo: "acesso_revogado" },
    });
    return { ok: false, error: "Seu acesso foi revogado. Fale com o síndico do condomínio." };
  }

  // SÍN-031: resolve o condomínio ATIVO a partir dos vínculos (home preferido);
  // o papel ativo é o papel do usuário NESSE condomínio (fallback: cadastro).
  const memberships = await carregarMemberships(user.id);
  const activeCondo = resolverCondominioAtivo(memberships, user.condominiumId ?? null);

  // Perfil ativo inicial = primário do condomínio ativo. Se houver mais de um
  // perfil, a UI oferece a escolha (needsProfileChoice) e chama setActiveProfile.
  const disponiveis = availableRolesForCondo(user, memberships, activeCondo);
  const ativo = disponiveis[0];

  await createSession({
    userId: user.id,
    role: ativo,
    condominiumId: activeCondo,
    administradoraId: user.administradoraId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
  });

  await registrarEventoSeguranca({
    tipo: "LOGIN_SUCESSO",
    resultado: "SUCESSO",
    userId: user.id,
    email: user.email,
    condominiumId: activeCondo,
    recurso: "auth.login",
  });

  return {
    ok: true,
    user: toPublic(user, ativo, disponiveis, activeCondo),
    needsProfileChoice: disponiveis.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Perfil ativo (SÍN-003) — trocar o perfil da sessão (login dual / switch)
// ---------------------------------------------------------------------------

export type SetActiveProfileResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

/**
 * Define o perfil ativo da sessão. Valida no servidor que o perfil pedido está
 * entre os disponíveis do usuário (nunca confia no cliente) e re-emite a sessão.
 */
export async function setActiveProfile(role: Role): Promise<SetActiveProfileResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const user = await userRepository.findById(session.userId);
  if (!user) return { ok: false, error: "Usuário não encontrado." };

  // Regra crítica validada no SERVIDOR: o perfil pedido precisa estar entre os
  // disponíveis do usuário NO CONDOMÍNIO ATIVO da sessão. Nunca confia no cliente.
  const memberships = await carregarMemberships(user.id);
  const disponiveis = availableRolesForCondo(user, memberships, session.condominiumId);
  if (!disponiveis.includes(role)) {
    return { ok: false, error: "Perfil não permitido para este usuário." };
  }

  await createSession({
    userId: user.id,
    role,
    condominiumId: session.condominiumId, // preserva o condomínio ativo
    administradoraId: user.administradoraId ?? null,
    mustChangePassword: user.mustChangePassword ?? false,
  });

  // SEG-016 Fase 3: registra a troca entre papéis que o usuário JÁ TEM
  // (dual-profile, SÍN-003) — não é concessão de novo acesso, é mudança de
  // contexto de sessão. "Conceder papel a OUTRO usuário" (o sentido mais
  // forte de "alteração de permissão" do card) não existe como feature no
  // app hoje — ver docs/SEG-016-EVENTOS-SEGURANCA.md.
  if (role !== session.role) {
    await registrarEventoSeguranca({
      tipo: "PERFIL_ALTERADO",
      resultado: "SUCESSO",
      userId: user.id,
      email: user.email,
      condominiumId: session.condominiumId,
      recurso: "auth.setActiveProfile",
      metadata: { de: session.role, para: role },
    });
  }

  return { ok: true, user: toPublic(user, role, disponiveis, session.condominiumId) };
}

export async function logout(): Promise<void> {
  // SEG-016: precisa ler a sessão ANTES de destruí-la, senão perdemos o
  // userId/condomínio do evento (getSession() depois disso retornaria nulo).
  // O e-mail é só para exibição na tela de consulta (ficaria só o cuid do
  // userId sem isso) — se a busca falhar por qualquer motivo, o evento ainda
  // é gravado sem e-mail, nunca deixamos de registrar o logout por causa disso.
  const session = await getSession();
  await destroySession();
  if (session) {
    const user = await userRepository.findById(session.userId).catch(() => null);
    await registrarEventoSeguranca({
      tipo: "LOGOUT",
      resultado: "SUCESSO",
      userId: session.userId,
      email: user?.email ?? null,
      condominiumId: session.condominiumId ?? null,
      recurso: "auth.logout",
    });
  }
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await userRepository.findById(session.userId);
  if (!user) return null;
  // SÍN-022: acesso revogado invalida a sessão em curso (próxima requisição).
  if (user.acessoRevogado) return null;
  // `role`/`condominiumId` refletem o CONTEXTO ATIVO da sessão (SÍN-003/SÍN-031),
  // não o papel/condomínio de cadastro. availableRoles = perfis no condo ativo.
  const memberships = await carregarMemberships(user.id);
  const disponiveis = availableRolesForCondo(user, memberships, session.condominiumId);
  return toPublic(user, session.role, disponiveis, session.condominiumId);
}

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role: Role;
  unit?: string | null;
  condominiumId: string;
}

export async function register(input: RegisterInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  const created = await userRepository.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: LABEL_TO_DB[input.role],
    unit: input.unit ?? null,
    condominiumId: input.condominiumId,
  });
  // SÍN-031: mantém o modelo consistente — todo usuário de condomínio tem vínculo.
  await membershipRepository.upsert(created.id, input.condominiumId, LABEL_TO_DB[input.role]);
  return toPublic(created);
}

// ---------------------------------------------------------------------------
// Primeiro acesso — registro de Morador com senha provisória
// ---------------------------------------------------------------------------

export interface RegisterMoradorInput {
  email: string;
  provisionalPassword: string;
  name: string;
  unit?: string | null;
  condominiumId: string;
}

/**
 * Registra um Morador com senha provisória. O campo `mustChangePassword`
 * é setado como true, forçando a troca no primeiro login.
 */
export async function registerMorador(input: RegisterMoradorInput): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.provisionalPassword);
  const created = await userRepository.create({
    email: input.email,
    passwordHash,
    name: input.name,
    role: "MORADOR",
    unit: input.unit ?? null,
    condominiumId: input.condominiumId,
    mustChangePassword: true,
  });
  await membershipRepository.upsert(created.id, input.condominiumId, "MORADOR");
  return toPublic(created);
}

// ---------------------------------------------------------------------------
// Ativação de acesso do Morador (SÍN-022)
// ---------------------------------------------------------------------------
//
// Chamado pela ação pública de ativação, DEPOIS de o convite ter sido validado
// (token válido, não expirado, não revogado, uso único). A senha vem do próprio
// morador — o Síndico nunca a define nem a vê. Cria a conta (ou reativa uma já
// existente do mesmo e-mail no condomínio) e abre a sessão (auto-login).

export interface AtivarMoradorInput {
  email: string;
  password: string; // definida pelo morador na ativação
  name: string;
  unit?: string | null;
  condominiumId: string;
}

export type AtivarMoradorResult =
  | { ok: true; user: PublicUser }
  | { ok: false; error: string };

export async function ativarAcessoMorador(input: AtivarMoradorInput): Promise<AtivarMoradorResult> {
  const passwordHash = await hashPassword(input.password);
  const existente = await userRepository.findByEmailInCondominium(input.email, input.condominiumId);

  let user: DbUser;
  if (existente) {
    // Só é permitido "assumir" uma conta existente se ela for de Morador — evita
    // que um convite de morador redefina a senha de um gestor com o mesmo e-mail.
    if (existente.role !== "MORADOR") {
      return {
        ok: false,
        error: "Já existe uma conta com este e-mail. Fale com o síndico do condomínio.",
      };
    }
    user = await userRepository.reativarMoradorComSenha(existente.id, {
      passwordHash,
      name: input.name,
      unit: input.unit ?? null,
    });
  } else {
    user = await userRepository.create({
      email: input.email,
      passwordHash,
      name: input.name,
      role: "MORADOR",
      unit: input.unit ?? null,
      condominiumId: input.condominiumId,
      mustChangePassword: false,
    });
  }

  // SÍN-031: garante o vínculo do morador com o condomínio do convite.
  await membershipRepository.upsert(user.id, input.condominiumId, "MORADOR");

  await createSession({
    userId: user.id,
    role: "Morador",
    condominiumId: user.condominiumId ?? null,
    administradoraId: user.administradoraId ?? null,
    mustChangePassword: false,
  });

  return { ok: true, user: toPublic(user, "Morador") };
}

// ---------------------------------------------------------------------------
// Alteração obrigatória de senha (primeiro acesso)
// ---------------------------------------------------------------------------

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Troca a senha do usuário autenticado, invalida a provisória,
 * limpa mustChangePassword e recria a sessão sem a flag.
 */
export async function changePassword(newPassword: string): Promise<ChangePasswordResult> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sessão expirada. Faça login novamente." };

  const user = await userRepository.findById(session.userId);
  if (!user) return { ok: false, error: "Usuário não encontrado." };

  // Impede reutilização da senha provisória (ou senha atual)
  const isSamePassword = await verifyPassword(user.passwordHash, newPassword);
  if (isSamePassword) {
    return { ok: false, error: "A nova senha não pode ser igual à senha atual." };
  }

  const newHash = await hashPassword(newPassword);
  await userRepository.updatePassword(user.id, newHash);

  // Recria a sessão sem mustChangePassword para liberar acesso normal.
  // Preserva o PERFIL ATIVO da sessão (SÍN-003) em vez do papel de cadastro.
  await createSession({
    userId: user.id,
    role: session.role,
    condominiumId: user.condominiumId ?? null,
    administradoraId: user.administradoraId ?? null,
    mustChangePassword: false,
  });

  await registrarEventoSeguranca({
    tipo: "SENHA_ALTERADA",
    resultado: "SUCESSO",
    userId: user.id,
    email: user.email,
    condominiumId: user.condominiumId ?? null,
    recurso: "auth.changePassword",
  });

  return { ok: true };
}