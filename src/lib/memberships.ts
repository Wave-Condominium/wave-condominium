// ---------------------------------------------------------------------------
// src/lib/memberships.ts
//
// Lógica PURA do acesso multi-condomínio (SÍN-031). Sem React/DOM nem imports
// de servidor — testável no Vitest.
//
// Um usuário tem N vínculos (CondominiumMembership), cada um com um papel NAQUELE
// condomínio. Estas funções resolvem: qual o condomínio ativo padrão, qual o
// papel do usuário num condomínio, se ele pode acessá-lo e quais perfis ele pode
// assumir no condomínio ativo (integrando o papel dual do SÍN-003).
//
// A AUTORIDADE é sempre o vínculo (nunca o condomínio "ativo" vindo da UI): as
// Server Actions validam `podeAcessarCondominio` no servidor antes de trocar.
// ---------------------------------------------------------------------------

import type { Role } from './rbac';
import { papeisDisponiveis } from './perfis';

export interface CondominioMembership {
  condominiumId: string;
  condominiumName: string;
  /** Papel do usuário NESTE condomínio (rótulo de app). */
  role: Role;
}

/**
 * Resolve o condomínio ativo padrão: usa `preferidoId` (o condomínio "home" do
 * usuário) quando ele estiver entre os vínculos; senão o primeiro vínculo; senão
 * o próprio `preferidoId` (pode ser null — ex.: Administradora sem contexto).
 */
export function resolverCondominioAtivo(
  memberships: CondominioMembership[],
  preferidoId: string | null,
): string | null {
  if (preferidoId && memberships.some((m) => m.condominiumId === preferidoId)) {
    return preferidoId;
  }
  return memberships[0]?.condominiumId ?? preferidoId ?? null;
}

/** Papel do usuário num condomínio específico (ou null se não houver vínculo). */
export function papelNoCondominio(
  memberships: CondominioMembership[],
  condominiumId: string | null,
): Role | null {
  if (!condominiumId) return null;
  return memberships.find((m) => m.condominiumId === condominiumId)?.role ?? null;
}

/** True quando o usuário tem vínculo com o condomínio (pode acessá-lo). */
export function podeAcessarCondominio(
  memberships: CondominioMembership[],
  condominiumId: string,
): boolean {
  return memberships.some((m) => m.condominiumId === condominiumId);
}

/** True quando há mais de um condomínio para alternar (mostra o seletor). */
export function temMultiplosCondominios(memberships: CondominioMembership[]): boolean {
  return memberships.length > 1;
}

/**
 * Perfis que o usuário pode assumir NO condomínio ativo. Base = papel do vínculo
 * (ou `fallbackRole` quando não há vínculo — retrocompatibilidade). O papel
 * secundário (SÍN-003) só entra quando o condomínio ativo é o "home" do usuário
 * (`aplicarSecundario`), preservando o login dual Síndico/Morador.
 */
export function papeisNoCondominio(
  membershipRole: Role | null,
  fallbackRole: Role,
  secondaryRole: Role | null,
  aplicarSecundario: boolean,
): Role[] {
  const primario = membershipRole ?? fallbackRole;
  return papeisDisponiveis(primario, aplicarSecundario ? secondaryRole ?? null : null);
}
