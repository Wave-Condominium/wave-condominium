"use server";

import {
  login,
  logout,
  getCurrentUser,
  changePassword,
  registerMorador,
  setActiveProfile,
  type RegisterMoradorInput,
} from "@/server/services/authService";
import { requireManager, AuthError } from "@/server/auth/guard";
import type { Role } from "@/lib/rbac";

export async function loginAction(email: string, password: string) {
  const result = await login(email, password);
  if (!result.ok) return { error: { message: result.error }, user: null, needsProfileChoice: false };
  return { error: null, user: result.user, needsProfileChoice: result.needsProfileChoice };
}

// ---------------------------------------------------------------------------
// Perfil ativo (SÍN-003) — usuário com mais de um perfil escolhe/alterna o
// perfil ativo da sessão. A validação de RBAC (perfil ∈ disponíveis) roda no
// servidor, dentro de setActiveProfile — nunca se confia no cliente.
// ---------------------------------------------------------------------------

export async function setActiveProfileAction(role: Role) {
  const result = await setActiveProfile(role);
  if (!result.ok) return { error: { message: result.error }, user: null };
  return { error: null, user: result.user };
}

export async function logoutAction() {
  await logout();
  return { ok: true };
}

export async function meAction() {
  return getCurrentUser();
}

// ---------------------------------------------------------------------------
// Primeiro acesso — troca obrigatória de senha
// ---------------------------------------------------------------------------

export async function changePasswordAction(newPassword: string) {
  try {
    const result = await changePassword(newPassword);
    if (!result.ok) return { error: { message: result.error } };
    return { error: null };
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      const msg = err.code === "NAO_AUTENTICADO"
        ? "Sessão expirada. Faça login novamente."
        : "Sem permissão para realizar esta ação.";
      return { error: { message: msg } };
    }
    console.error("[changePasswordAction]", err);
    return { error: { message: "Erro inesperado ao alterar a senha." } };
  }
}

// ---------------------------------------------------------------------------
// Cadastro de Morador com senha provisória (apenas Síndico/Admin)
// ---------------------------------------------------------------------------

export async function registerMoradorAction(input: Omit<RegisterMoradorInput, "condominiumId">) {
  try {
    // Guarda RBAC: só gestores podem cadastrar moradores.
    const session = await requireManager();

    // Multi-tenancy: condominiumId vem da sessão do gestor, nunca do cliente.
    if (!session.condominiumId) {
      return { error: { message: "Condomínio ativo não identificado na sessão." }, user: null };
    }

    const user = await registerMorador({
      ...input,
      condominiumId: session.condominiumId,
    });
    return { error: null, user };
  } catch (err: unknown) {
    // AuthError: sessão expirada ou sem permissão
    if (err instanceof AuthError) {
      const msg = err.code === "NAO_AUTENTICADO"
        ? "Sessão expirada. Faça login novamente."
        : "Apenas Síndicos e Administradores podem cadastrar moradores.";
      return { error: { message: msg }, user: null };
    }
    // Constraint unique do Prisma: e-mail duplicado neste condomínio
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return { error: { message: "Já existe um usuário cadastrado com este e-mail neste condomínio." }, user: null };
    }
    // Erro genérico — loga e retorna mensagem amigável
    console.error("[registerMoradorAction]", err);
    return { error: { message: "Erro ao criar a conta. Verifique os dados e tente novamente." }, user: null };
  }
}