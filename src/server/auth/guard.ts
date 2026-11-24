import { getSession, type SessionPayload } from "./session";
import { isManager, isPlatformAdmin, isAdministradora } from "@/lib/rbac";
import { userRepository } from "@/server/repositories/userRepository";
import { membershipRepository } from "@/server/repositories/membershipRepository";
import { registrarEventoSeguranca } from "@/server/security/registrarEventoSeguranca";

export class AuthError extends Error {
  constructor(public code: "NAO_AUTENTICADO" | "SEM_PERMISSAO") {
    super(code);
    this.name = "AuthError";
  }
}

/**
 * Exige apenas estar autenticado.
 *
 * SÍN-022: como o JWT é stateless, a revogação de acesso é aplicada aqui — uma
 * leitura leve (apenas a flag `acessoRevogado`) barra qualquer requisição de um
 * usuário revogado, mesmo que o cookie ainda seja criptograficamente válido.
 * Se o usuário não existe mais, a sessão também é considerada inválida.
 *
 * SEG-016: NÃO registra evento aqui (sessão ausente/expirada é rotina — ex.:
 * usuário deslogado abrindo uma aba antiga) — só nas guards de PAPEL abaixo,
 * onde alguém JÁ autenticado tenta algo fora do que pode fazer, que é o caso
 * real de "tentativa de acesso negada" que vale a pena investigar.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new AuthError("NAO_AUTENTICADO");
  const revogado = await userRepository.isAcessoRevogado(session.userId);
  if (revogado === null || revogado) throw new AuthError("NAO_AUTENTICADO");
  return session;
}

/** Exige papel de gestao (Sindico ou Admin). */
export async function requireManager(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isManager(session.role)) {
    await registrarEventoSeguranca({
      tipo: "ACESSO_NEGADO",
      resultado: "FALHA",
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
      recurso: "guard.requireManager",
    });
    throw new AuthError("SEM_PERMISSAO");
  }
  return session;
}

/** Exige Admin de plataforma. */
export async function requirePlatformAdmin(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isPlatformAdmin(session.role)) {
    await registrarEventoSeguranca({
      tipo: "ACESSO_NEGADO",
      resultado: "FALHA",
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
      recurso: "guard.requirePlatformAdmin",
    });
    throw new AuthError("SEM_PERMISSAO");
  }
  return session;
}

/** Exige papel de Administradora (ou Admin de plataforma). */
export async function requireAdministradora(): Promise<SessionPayload> {
  const session = await requireSession();
  if (!isAdministradora(session.role) && !isPlatformAdmin(session.role)) {
    await registrarEventoSeguranca({
      tipo: "ACESSO_NEGADO",
      resultado: "FALHA",
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
      recurso: "guard.requireAdministradora",
    });
    throw new AuthError("SEM_PERMISSAO");
  }
  return session;
}

/**
 * Garante que a sessao pode atuar no condominio informado (isolamento
 * multi-tenant). Permitido quando: e o condominio ativo da sessao; OU e uma
 * Administradora que gere o condominio; OU Admin de plataforma.
 *
 * NOTA: a checagem de "administradora gere este condominio" deve consultar o
 * banco (condominium.administradoraId === session.administradoraId). Aqui
 * validamos a base; o repositorio confirma o vinculo ao carregar o condominio.
 */
export async function requireCondominioScope(condominiumId: string): Promise<SessionPayload> {
  const session = await requireSession();
  if (isPlatformAdmin(session.role)) return session;
  if (isAdministradora(session.role)) return session;
  if (session.condominiumId && session.condominiumId === condominiumId) return session;
  // SÍN-031: o usuário pode agir num condomínio se tiver VÍNCULO com ele
  // (papel por condomínio), mesmo que não seja o condomínio ativo da sessão.
  const vinculo = await membershipRepository.findByUserAndCondominium(session.userId, condominiumId);
  if (vinculo) return session;
  await registrarEventoSeguranca({
    tipo: "ACESSO_NEGADO",
    resultado: "FALHA",
    userId: session.userId,
    condominiumId,
    recurso: "guard.requireCondominioScope",
    metadata: { condominioSolicitado: condominiumId, condominioAtivoSessao: session.condominiumId },
  });
  throw new AuthError("SEM_PERMISSAO");
}