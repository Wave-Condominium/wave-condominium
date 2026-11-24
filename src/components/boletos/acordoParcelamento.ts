// ---------------------------------------------------------------------------
// src/components/boletos/acordoParcelamento.ts
//
// Regra pura (testável) do acordo de parcelamento de boleto (SÍN-009).
//
// O síndico não paga boletos de terceiros; entre as ações de cobrança
// permitidas está registrar um acordo de parcelamento. Esta validação é a
// fonte única da regra e roda no cliente (feedback) e no servidor (autoridade).
// ---------------------------------------------------------------------------

export const PARCELAS_MIN = 2;
export const PARCELAS_MAX = 24;
export const OBS_MAX = 300;

export interface AcordoInput {
  parcelas: number;
  /** 'YYYY-MM-DD' — vencimento da 1ª parcela. */
  primeiraParcela: string;
  observacao?: string;
}

export type ValidacaoAcordo =
  | { ok: true; acordo: { parcelas: number; primeiraParcela: string; observacao: string } }
  | { ok: false; erro: string };

/** 'YYYY-MM-DD' válido (formato + data real). */
function isDataISOValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Valida e normaliza o acordo de parcelamento. */
export function validarAcordo(input: AcordoInput): ValidacaoAcordo {
  const parcelas = Number(input.parcelas);
  if (!Number.isInteger(parcelas) || parcelas < PARCELAS_MIN || parcelas > PARCELAS_MAX) {
    return { ok: false, erro: `O número de parcelas deve estar entre ${PARCELAS_MIN} e ${PARCELAS_MAX}.` };
  }
  const primeira = (input.primeiraParcela ?? '').trim();
  if (!isDataISOValida(primeira)) {
    return { ok: false, erro: 'Informe uma data válida para a 1ª parcela.' };
  }
  const observacao = (input.observacao ?? '').trim();
  if (observacao.length > OBS_MAX) {
    return { ok: false, erro: `A observação deve ter no máximo ${OBS_MAX} caracteres.` };
  }
  return { ok: true, acordo: { parcelas, primeiraParcela: primeira, observacao } };
}
