// ---------------------------------------------------------------------------
// src/components/dao/governanceCore.ts
//
// Modelo UNIFICADO e regras PURAS do modulo de Governanca (DAO).
//
// Antes, GovernanceUser e Governance gravavam no mesmo 'wave_proposals' com
// formatos incompativeis. Este arquivo passa a ser a fonte unica de verdade do
// modelo e das regras de negocio (prazo de 30 dias, voto unico por morador,
// apuracao e criterio de aprovacao). Sem dependencia de React/DOM.
// ---------------------------------------------------------------------------

export type Categoria =
  | 'obras'
  | 'seguranca'
  | 'financeiro'
  | 'eventos'
  | 'melhorias'
  | 'sustentabilidade'
  | 'outros';

/** Ciclo de vida completo da proposta (spec secao 9). */
export type StatusProposta =
  | 'votacao_aberta'
  | 'votacao_encerrada'
  | 'aprovada_comunidade'
  | 'fila_prioridades'
  | 'em_assembleia'
  | 'aprovada_assembleia'
  | 'em_execucao'
  | 'concluida'
  | 'rejeitada';

export type VoteChoice = 'aprovo' | 'reprovo' | 'abstencao';

export interface ComentarioProposta {
  id: string;
  autor: string;
  conteudo: string;
  data: string; // ISO
}

export interface Proposta {
  id: string;
  titulo: string;
  descricao: string;
  categoria: Categoria;
  autor: string;
  /** ISO 8601 */
  criadaEm: string;
  /** ISO 8601 — criadaEm + 30 dias. */
  prazoVotacao: string;
  status: StatusProposta;
  /** Voto unico por morador: mapa userId -> escolha. */
  votos: Record<string, VoteChoice>;
  encerradaEm?: string;
  aprovadaEm?: string;
  /** Rejeição pelo síndico (SÍN-005): motivo, responsável e momento da decisão. */
  motivoRejeicao?: string;
  rejeitadaPor?: string;
  rejeitadaEm?: string;
  comentarios?: ComentarioProposta[];
}

export interface GovernanceConfig {
  /** Total de moradores aptos a votar (base da regra de maioria e da participacao). */
  totalMoradores: number;
}

export const DEFAULT_CONFIG: GovernanceConfig = { totalMoradores: 20 };

/** Dias corridos de votacao (spec secao 2). */
export const DIAS_VOTACAO = 30;

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  obras: 'Obras',
  seguranca: 'Seguranca',
  financeiro: 'Financeiro',
  eventos: 'Eventos',
  melhorias: 'Melhorias',
  sustentabilidade: 'Sustentabilidade',
  outros: 'Outros',
};

export const CATEGORIA_OPTIONS: Categoria[] = [
  'obras', 'seguranca', 'financeiro', 'eventos', 'melhorias', 'sustentabilidade', 'outros',
];

export const STATUS_LABEL: Record<StatusProposta, string> = {
  votacao_aberta: 'Votacao Aberta',
  votacao_encerrada: 'Votacao Encerrada',
  aprovada_comunidade: 'Aprovada pela Comunidade',
  fila_prioridades: 'Na Fila de Prioridades',
  em_assembleia: 'Em Assembleia',
  aprovada_assembleia: 'Aprovada em Assembleia',
  em_execucao: 'Em Execucao',
  concluida: 'Concluida',
  rejeitada: 'Rejeitada',
};

// --- Regras puras ------------------------------------------------------------

/** Prazo de votacao a partir da criacao (+30 dias corridos), em ISO. */
export function prazoFrom(criadaEmISO: string): string {
  const d = new Date(criadaEmISO);
  d.setDate(d.getDate() + DIAS_VOTACAO);
  return d.toISOString();
}

/** true se o prazo de votacao ja passou. */
export function isVotacaoExpirada(p: Pick<Proposta, 'prazoVotacao'>, now: Date = new Date()): boolean {
  return now.getTime() >= new Date(p.prazoVotacao).getTime();
}

/** Dias restantes ate o encerramento (0 se ja encerrou). */
export function diasRestantes(p: Pick<Proposta, 'prazoVotacao'>, now: Date = new Date()): number {
  const ms = new Date(p.prazoVotacao).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export interface Apuracao {
  aprovo: number;
  reprovo: number;
  abstencao: number;
  total: number;
  /** % de aprovacao entre votos validos (aprovo+reprovo), 0-100. */
  percentAprovacao: number;
  percentReprovacao: number;
  percentAbstencao: number;
}

/** Conta os votos e calcula percentuais (spec secao 4). */
export function apurar(p: Pick<Proposta, 'votos'>): Apuracao {
  let aprovo = 0, reprovo = 0, abstencao = 0;
  for (const v of Object.values(p.votos || {})) {
    if (v === 'aprovo') aprovo++;
    else if (v === 'reprovo') reprovo++;
    else abstencao++;
  }
  const total = aprovo + reprovo + abstencao;
  const validos = aprovo + reprovo;
  const pct = (n: number, base: number) => (base > 0 ? Math.round((n / base) * 100) : 0);
  return {
    aprovo, reprovo, abstencao, total,
    percentAprovacao: pct(aprovo, validos),
    percentReprovacao: pct(reprovo, validos),
    percentAbstencao: pct(abstencao, total),
  };
}

/**
 * Resultado ao encerrar a votacao (regra escolhida pelo condominio):
 * APROVADA se os votos "Aprovo" forem MAIORIA de TODOS os moradores (> 50%).
 * Caso contrario, REJEITADA.
 */
export function resolverResultado(
  p: Pick<Proposta, 'votos'>,
  config: GovernanceConfig,
): 'aprovada_comunidade' | 'rejeitada' {
  const { aprovo } = apurar(p);
  return aprovo > config.totalMoradores / 2 ? 'aprovada_comunidade' : 'rejeitada';
}

/** Conjunto de status considerados "aprovados pela comunidade" (entram na fila). */
const STATUS_APROVADOS: StatusProposta[] = [
  'aprovada_comunidade', 'fila_prioridades', 'em_assembleia',
  'aprovada_assembleia', 'em_execucao', 'concluida',
];

export function isAprovada(p: Pick<Proposta, 'status'>): boolean {
  return STATUS_APROVADOS.includes(p.status);
}

export function isEmVotacao(p: Pick<Proposta, 'status'>): boolean {
  return p.status === 'votacao_aberta';
}

export function isRejeitada(p: Pick<Proposta, 'status'>): boolean {
  return p.status === 'rejeitada';
}

/** Status simplificado exibido na Fila / Deliberacoes (spec: 3 estados). */
export type StatusFila = 'aguardando' | 'em_execucao' | 'concluida';

export function statusFila(p: Pick<Proposta, 'status'>): StatusFila {
  if (p.status === 'concluida') return 'concluida';
  if (p.status === 'em_execucao') return 'em_execucao';
  return 'aguardando';
}

export const STATUS_FILA_LABEL: Record<StatusFila, string> = {
  aguardando: 'Aguardando',
  em_execucao: 'Em Execucao',
  concluida: 'Concluida',
};

/** Motivo do encerramento de uma proposta rejeitada (regra de maioria). */
export function motivoRejeicao(config: GovernanceConfig): string {
  return `Nao atingiu a maioria necessaria (mais de 50% dos ${config.totalMoradores} moradores).`;
}

/**
 * Ordena a Fila de Prioridades: maior apoio primeiro. Criterio principal =
 * numero absoluto de votos favoraveis; desempate pelo % de aprovacao.
 */
export function ordenarFila(propostas: Proposta[]): Proposta[] {
  return [...propostas].sort((a, b) => {
    const aa = apurar(a), ab = apurar(b);
    if (ab.aprovo !== aa.aprovo) return ab.aprovo - aa.aprovo;
    return ab.percentAprovacao - aa.percentAprovacao;
  });
}

/** Formata ISO -> 'DD/MM/AAAA'. */
export function formatData(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}
