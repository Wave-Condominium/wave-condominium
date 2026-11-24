// ---------------------------------------------------------------------------
// src/components/dao/governanceFilter.ts
//
// Filtro da lista de propostas em Governança + leitura do parâmetro de URL.
//
// Extraído de GovernanceView para que a Ação Rápida "Votações" do Dashboard
// (MOR-020) possa levar o morador direto às votações EM ANDAMENTO: o link
// carrega `?filtro=aberta` e a tela inicia já nesse filtro.
//
// A função é pura (sem React/DOM) — testável isoladamente e reutilizável.
// ---------------------------------------------------------------------------

export type Filtro = 'todas' | 'aberta' | 'aprovadas' | 'rejeitadas';

// Aceita o valor canônico e apelidos comuns (inclusive o histórico 'ativas',
// já usado no link antigo) para não quebrar links existentes.
const FILTRO_ALIASES: Record<string, Filtro> = {
  todas: 'todas',
  aberta: 'aberta',
  abertas: 'aberta',
  ativa: 'aberta',
  ativas: 'aberta',
  em_votacao: 'aberta',
  aprovada: 'aprovadas',
  aprovadas: 'aprovadas',
  rejeitada: 'rejeitadas',
  rejeitadas: 'rejeitadas',
};

/**
 * Converte o valor do parâmetro `?filtro=` em um Filtro válido.
 * Retorna null quando ausente ou desconhecido (a tela mantém o padrão).
 */
export function parseFiltroParam(value: string | null | undefined): Filtro | null {
  if (!value) return null;
  return FILTRO_ALIASES[value.trim().toLowerCase()] ?? null;
}
