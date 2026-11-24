// ---------------------------------------------------------------------------
// src/components/dao/rejeicao.ts
//
// Regra pura (testável) da rejeição de proposta pelo síndico (SÍN-005).
//
// A justificativa é OBRIGATÓRIA: uma proposta só pode ser rejeitada com um
// motivo claro (ex.: fora do escopo). Esta validação é a fonte única da regra
// e roda tanto no cliente (feedback imediato) quanto no servidor (autoridade).
// ---------------------------------------------------------------------------

/** Tamanho mínimo do motivo (evita justificativas vazias ou triviais). */
export const MOTIVO_MIN = 5;
/** Tamanho máximo do motivo (proteção contra abuso / payloads enormes). */
export const MOTIVO_MAX = 500;

export type ValidacaoMotivo =
  | { ok: true; motivo: string }
  | { ok: false; erro: string };

/**
 * Valida e normaliza o motivo da rejeição. Retorna o motivo já com trim quando
 * válido, ou uma mensagem de erro compreensível ao usuário quando inválido.
 */
export function validarMotivoRejeicao(motivo: string | null | undefined): ValidacaoMotivo {
  const texto = (motivo ?? '').trim();
  if (texto.length === 0) {
    return { ok: false, erro: 'Informe o motivo da rejeição.' };
  }
  if (texto.length < MOTIVO_MIN) {
    return { ok: false, erro: `O motivo deve ter ao menos ${MOTIVO_MIN} caracteres.` };
  }
  if (texto.length > MOTIVO_MAX) {
    return { ok: false, erro: `O motivo deve ter no máximo ${MOTIVO_MAX} caracteres.` };
  }
  return { ok: true, motivo: texto };
}
