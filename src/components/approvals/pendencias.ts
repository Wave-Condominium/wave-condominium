// ---------------------------------------------------------------------------
// src/components/approvals/pendencias.ts
//
// Modelo de domínio e lógica PURA da Central de Aprovações Pendentes (SÍN-026).
// Sem React/DOM nem imports de servidor — testável no Vitest.
//
// A Central agrega, num formato único (`Pendencia`), solicitações de vários
// módulos que aguardam a decisão do Síndico. Cada módulo-fonte é mapeado para
// este formato pela Server Action agregadora; aqui ficam apenas os tipos, a
// derivação de prazo/urgência e a priorização — extensível a novas fontes.
// ---------------------------------------------------------------------------

// --- Tipos de fonte (extensível: financeiro, reuniões, manutenção... depois) -

export type PendenciaTipo =
  | 'RESERVA'
  | 'PROPOSTA'
  | 'DESPESA'
  | 'ATA'
  | 'MANUTENCAO'
  | 'CONVOCACAO';

export const PENDENCIA_TIPO_LABEL: Record<PendenciaTipo, string> = {
  RESERVA: 'Reserva de área comum',
  PROPOSTA: 'Proposta de governança',
  DESPESA: 'Despesa acima da alçada',
  ATA: 'Ata de reunião',
  MANUTENCAO: 'Solicitação de manutenção',
  CONVOCACAO: 'Convocação de reunião',
};

// --- Entidade unificada ------------------------------------------------------

export interface PendenciaDetalhe {
  label: string;
  valor: string;
}

export interface Pendencia {
  tipo: PendenciaTipo;
  /** Id do item no módulo de origem (usado para despachar a decisão). */
  id: string;
  /** Resumo curto (ex.: "Salão de Festas · 12/09"). */
  titulo: string;
  solicitante: string;
  /** ISO — quando a solicitação entrou. */
  dataEntrada: string;
  /** ISO — prazo para a decisão do Síndico (opcional). */
  prazo?: string;
  /** Informações complementares para decidir sem sair da tela. */
  detalhes: PendenciaDetalhe[];
  /** Rejeição exige motivo? (proposta: sim; reserva: opcional). */
  rejeicaoMotivoObrigatorio: boolean;
}

export type Decisao = 'aprovar' | 'rejeitar';

// --- Prazo / urgência --------------------------------------------------------

export type PrazoStatus = 'sem_prazo' | 'no_prazo' | 'proximo' | 'atrasado';

/** Janela (horas) para considerar um prazo "próximo do vencimento". */
export const PROXIMO_PRAZO_HORAS = 48;

export function prazoStatus(prazo: string | undefined, now: number = Date.now()): PrazoStatus {
  if (!prazo) return 'sem_prazo';
  const t = new Date(prazo).getTime();
  if (Number.isNaN(t)) return 'sem_prazo';
  if (t < now) return 'atrasado';
  if (t - now <= PROXIMO_PRAZO_HORAS * 3_600_000) return 'proximo';
  return 'no_prazo';
}

export const PRAZO_STATUS_LABEL: Record<PrazoStatus, string> = {
  atrasado: 'Atrasada',
  proximo: 'Vence em breve',
  no_prazo: 'No prazo',
  sem_prazo: 'Sem prazo',
};

/** Classes de badge por urgência (consistente com o design system). */
export const PRAZO_STATUS_COR: Record<PrazoStatus, string> = {
  atrasado: 'bg-red-100 text-red-700',
  proximo: 'bg-amber-100 text-amber-700',
  no_prazo: 'bg-wave-100 text-wave-600',
  sem_prazo: 'bg-gray-100 text-gray-500',
};

const PESO_URGENCIA: Record<PrazoStatus, number> = {
  atrasado: 0,
  proximo: 1,
  no_prazo: 2,
  sem_prazo: 3,
};

/**
 * Ordena por urgência (prioriza as mais críticas no topo):
 * atrasadas → próximas do vencimento → no prazo → sem prazo. Em empate, o
 * prazo mais cedo primeiro; persistindo, a entrada mais antiga primeiro.
 * Não muta a lista recebida.
 */
export function ordenarPendencias(list: Pendencia[], now: number = Date.now()): Pendencia[] {
  return [...list].sort((a, b) => {
    const pa = PESO_URGENCIA[prazoStatus(a.prazo, now)];
    const pb = PESO_URGENCIA[prazoStatus(b.prazo, now)];
    if (pa !== pb) return pa - pb;
    const ta = a.prazo ? new Date(a.prazo).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.prazo ? new Date(b.prazo).getTime() : Number.POSITIVE_INFINITY;
    if (ta !== tb) return ta - tb;
    return new Date(a.dataEntrada).getTime() - new Date(b.dataEntrada).getTime();
  });
}

// --- Validação da decisão ----------------------------------------------------

/** Motivo é exigido apenas quando a fonte marca `rejeicaoMotivoObrigatorio`. */
export function validarMotivoDecisao(
  pendencia: Pick<Pendencia, 'rejeicaoMotivoObrigatorio'>,
  motivo: string,
): string | null {
  if (pendencia.rejeicaoMotivoObrigatorio && motivo.trim().length < 3) {
    return 'Informe o motivo da rejeição.';
  }
  return null;
}
