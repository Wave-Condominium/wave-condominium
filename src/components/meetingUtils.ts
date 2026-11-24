// ---------------------------------------------------------------------------
// src/components/meetingUtils.ts
//
// Utilidades puras de Reuniões (MOR-055).
//
// Regra do card: o botão "Entrar na Reunião" só deve aparecer quando existir uma
// reunião programada COM um link válido. Este helper isola essa checagem para
// ser reutilizável e testável (sem React/DOM).
// ---------------------------------------------------------------------------

/**
 * Retorna true quando o link da reunião é um endereço http(s) utilizável.
 * Links ausentes, vazios ou malformados retornam false — nesses casos a UI não
 * exibe o botão de entrar (evita um "Entrar" quebrado).
 */
export function temLinkReuniaoValido(link?: string | null): boolean {
  if (!link) return false;
  return /^https?:\/\/\S+/i.test(link.trim());
}
