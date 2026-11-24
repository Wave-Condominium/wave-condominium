// ---------------------------------------------------------------------------
// src/lib/perfis.ts
//
// Perfis que um usuário pode assumir (SÍN-003).
//
// Um usuário pode ter um papel primário (`role`) e, opcionalmente, um papel
// secundário (`secondaryRole`) — ex.: Síndico que também é Morador. Estas
// funções puras são a fonte única da regra de "quais perfis o usuário pode
// usar" e "pode assumir este perfil?". Trabalham com os rótulos de app (Role).
// ---------------------------------------------------------------------------

import type { Role } from './rbac';

/**
 * Lista de perfis disponíveis para o usuário (sem duplicar), com o primário
 * primeiro. O secundário só entra se existir e for diferente do primário.
 */
export function papeisDisponiveis(role: Role, secondaryRole?: Role | null): Role[] {
  const lista: Role[] = [role];
  if (secondaryRole && secondaryRole !== role) lista.push(secondaryRole);
  return lista;
}

/** O usuário pode assumir `alvo` como perfil ativo? */
export function podeAssumir(
  role: Role,
  secondaryRole: Role | null | undefined,
  alvo: Role,
): boolean {
  return papeisDisponiveis(role, secondaryRole).includes(alvo);
}

/** True quando o usuário tem mais de um perfil (pode escolher/alternar). */
export function temMultiplosPerfis(role: Role, secondaryRole?: Role | null): boolean {
  return papeisDisponiveis(role, secondaryRole).length > 1;
}
