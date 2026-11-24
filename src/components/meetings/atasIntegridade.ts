// ---------------------------------------------------------------------------
// src/components/meetings/atasIntegridade.ts
//
// Integridade das atas (MOR-033).
//
// Cada ata recebe, no momento do registro, um "código de integridade" derivado
// do seu conteúdo. Para consultar, recalcula-se o código a partir do conteúdo
// atual e compara-se com o código registrado: se forem iguais, a ata está
// íntegra (não foi alterada após o registro); se diferirem, houve alteração.
//
// Implementação: checksum determinístico (FNV-1a de 32 bits, ida e volta) —
// suficiente para um indicador de integridade no protótipo, com detecção de
// adulteração. Em produção, o registro oficial deve ser ancorado na rede
// Stellar (mesmo padrão de auditoria já usado em Boletos/Manutenção).
//
// Função pura (sem React/DOM) — testável.
// ---------------------------------------------------------------------------

export type StatusIntegridade = 'integra' | 'alterada' | 'sem_registro';

function fnv1a(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Normaliza o conteúdo para um código estável entre plataformas (LF/trim). */
function normalizar(conteudo: string): string {
  return (conteudo ?? '').replace(/\r\n/g, '\n').trim();
}

/**
 * Calcula o código de integridade de uma ata a partir do seu conteúdo.
 * Determinístico: o mesmo conteúdo sempre gera o mesmo código.
 */
export function calcularHashAta(conteudo: string): string {
  const norm = normalizar(conteudo);
  const frente = fnv1a(norm).toString(16).padStart(8, '0');
  const verso = fnv1a(norm.split('').reverse().join('')).toString(16).padStart(8, '0');
  return (frente + verso).toUpperCase();
}

/**
 * Verifica a integridade comparando o conteúdo atual com o código registrado.
 * - 'sem_registro' quando não há código oficial associado;
 * - 'integra' quando o conteúdo confere;
 * - 'alterada' quando o conteúdo diverge do código registrado.
 */
export function verificarIntegridade(
  conteudo: string,
  hashRegistrado?: string | null,
): StatusIntegridade {
  if (!hashRegistrado) return 'sem_registro';
  return calcularHashAta(conteudo) === hashRegistrado.toUpperCase() ? 'integra' : 'alterada';
}
