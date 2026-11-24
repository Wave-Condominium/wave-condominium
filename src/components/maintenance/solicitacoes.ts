// ---------------------------------------------------------------------------
// src/components/maintenance/solicitacoes.ts
//
// Modelo de aplicação e lógica PURA das Solicitações de manutenção do morador
// (SÍN-026). Sem React/DOM nem imports de servidor — testável no Vitest.
//
// A solicitação é aberta pelo morador e aguarda a decisão do síndico na Central
// (aprovar = aceitar/Em andamento; recusar = com motivo). As Server Actions
// mapeiam o enum do Prisma (StatusOcorrencia) de/para estes rótulos-string.
// ---------------------------------------------------------------------------

export type StatusSolicitacao =
  | 'aguardando'
  | 'em_andamento'
  | 'concluida'
  | 'recusada'
  | 'cancelada';

export const STATUS_SOLICITACAO_LABEL: Record<StatusSolicitacao, string> = {
  aguardando: 'Aguardando aprovação',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
};

export const STATUS_SOLICITACAO_COR: Record<StatusSolicitacao, string> = {
  aguardando: 'bg-amber-100 text-amber-700',
  em_andamento: 'bg-blue-100 text-blue-700',
  concluida: 'bg-emerald-100 text-emerald-700',
  recusada: 'bg-red-100 text-red-700',
  cancelada: 'bg-gray-100 text-gray-500',
};

export type PrioridadeSolicitacao = 'high' | 'medium' | 'low';

export const PRIORIDADE_LABEL: Record<PrioridadeSolicitacao, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export interface Solicitacao {
  id: string;
  protocolo: string;
  titulo: string;
  /** Categoria (mapeada de `tipo` no banco). */
  categoria: string;
  descricao?: string;
  prioridade: PrioridadeSolicitacao;
  unidade: string;
  solicitante?: string;
  status: StatusSolicitacao;
  motivoRecusa?: string;
  /** ISO. */
  aberturaEm: string;
  decididoEm?: string;
}

export interface NovaSolicitacaoInput {
  titulo: string;
  categoria: string;
  prioridade: PrioridadeSolicitacao;
  descricao: string;
}

/** Valida os campos obrigatórios de uma nova solicitação. Msg de erro ou null. */
export function validarNovaSolicitacao(input: Partial<NovaSolicitacaoInput>): string | null {
  if (!input.titulo || !input.titulo.trim()) return 'Informe o título da solicitação.';
  if (!input.categoria || !input.categoria.trim()) return 'Selecione a categoria.';
  if (!input.descricao || !input.descricao.trim()) return 'Descreva o problema.';
  return null;
}

/** Protocolo legível e único o suficiente para exibição (ano + timestamp curto). */
export function gerarProtocolo(now: number = Date.now()): string {
  const ano = new Date(now).getFullYear();
  const seq = String(now).slice(-6);
  return `${ano}-${seq}`;
}
