// ---------------------------------------------------------------------------
// src/components/meetings/presencaConfirmacoes.ts
//
// Confirmação de presença em reuniões/assembleias (MOR-032).
//
// Cada confirmação fica vinculada à REUNIÃO e ao MORADOR/UNIDADE que confirmou,
// permitindo que o Síndico use as confirmações como registro de participantes.
// A deduplicação é por unidade (quando houver) ou pelo nome — uma unidade
// confirma uma vez por reunião.
//
// Lógica pura (sem React/DOM) — testável.
// ---------------------------------------------------------------------------

export interface ConfirmacaoPresenca {
  meetingId: string;
  nome: string;
  /** Unidade do morador; pode ser vazia se o perfil não tiver unidade. */
  unidade: string;
  /** ISO 8601 — quando a presença foi confirmada. */
  confirmadoEm: string;
}

/**
 * Chave de identidade do participante numa reunião: normaliza a unidade
 * (equipara "Apto 203", "apto 203" e "203"); sem unidade, usa o nome.
 */
export function chaveParticipante(unidade: string, nome: string): string {
  const base = unidade && unidade.trim() ? unidade : nome;
  return base
    .toLowerCase()
    .replace(/\b(apartamento|apto|apt|ap|unidade|un|bloco|bl)\b/g, '')
    .replace(/[^0-9a-z]/g, '')
    .trim();
}

/** Já existe confirmação desse participante (por unidade/nome) para a reunião? */
export function jaConfirmou(
  lista: ConfirmacaoPresenca[],
  meetingId: string,
  unidade: string,
  nome: string,
): boolean {
  const k = chaveParticipante(unidade, nome);
  return lista.some((c) => c.meetingId === meetingId && chaveParticipante(c.unidade, c.nome) === k);
}

/** Adiciona a confirmação se ainda não houver (não muta a entrada). */
export function adicionarConfirmacao(
  lista: ConfirmacaoPresenca[],
  nova: ConfirmacaoPresenca,
): ConfirmacaoPresenca[] {
  if (jaConfirmou(lista, nova.meetingId, nova.unidade, nova.nome)) return lista;
  return [...lista, nova];
}

/** Confirmações de uma reunião (registro de participantes). */
export function confirmacoesDaReuniao(
  lista: ConfirmacaoPresenca[],
  meetingId: string,
): ConfirmacaoPresenca[] {
  return lista.filter((c) => c.meetingId === meetingId);
}

/** Total de participantes confirmados numa reunião. */
export function totalConfirmados(lista: ConfirmacaoPresenca[], meetingId: string): number {
  return confirmacoesDaReuniao(lista, meetingId).length;
}
