// ---------------------------------------------------------------------------
// src/components/treasury/receitas.ts
//
// Modelo de aplicação e lógica PURA das Receitas da cota condominial (MOR-057).
// Sem React/DOM nem imports de servidor — testável no Vitest.
//
// A receita nasce EXCLUSIVAMENTE da confirmação de pagamento pelo PSP/Gateway
// (webhook) → baixa automática → contabilização. Open Finance NÃO é fonte
// (só reconciliação, MOR-023). Aqui ficam os tipos, a reconciliação (comparação
// com o boleto) e a consolidação mensal do histórico.
// ---------------------------------------------------------------------------

import { formatBRL } from '@/components/treasury/despesas';

export type StatusContabilizacao = 'CONTABILIZADA' | 'PENDENTE_CONCILIACAO' | 'DIVERGENTE';

export const STATUS_CONTABILIZACAO_LABEL: Record<StatusContabilizacao, string> = {
  CONTABILIZADA: 'Contabilizada',
  PENDENTE_CONCILIACAO: 'Pendente de conciliação',
  DIVERGENTE: 'Divergente',
};

export const STATUS_CONTABILIZACAO_COR: Record<StatusContabilizacao, string> = {
  CONTABILIZADA: 'bg-emerald-100 text-emerald-700',
  PENDENTE_CONCILIACAO: 'bg-amber-100 text-amber-700',
  DIVERGENTE: 'bg-red-100 text-red-700',
};

export interface Receita {
  id: string;
  unitNumber: string;
  unitOwner: string;
  /** 'YYYY-MM' — a cota paga. */
  referenceMonth: string;
  valor: number;
  /** ISO — data de confirmação do pagamento. */
  dataPagamento: string;
  status: StatusContabilizacao;
  origem: 'PSP_WEBHOOK';
  pspReferencia?: string;
  divergenciaMotivo?: string;
  boletoId?: string;
}

/** Só dígitos — para casar "Apto 203" (perfil) com "203" (boleto/receita). */
export function normalizarUnidade(u: string | null | undefined): string {
  return (u ?? '').replace(/\D/g, '');
}

// --- Reconciliação (PAG-009): compara o valor pago com o boleto ---------------

export interface ReconciliacaoResultado {
  status: StatusContabilizacao;
  motivo?: string;
}

/** Tolerância de centavos para considerar valores iguais. */
const TOLERANCIA = 0.005;

/**
 * Reconciliação de uma confirmação de pagamento com o boleto correspondente.
 * - Sem boleto vinculável → PENDENTE_CONCILIACAO (não dá pra atribuir com certeza).
 * - Valor diferente do boleto → DIVERGENTE (com motivo rastreável).
 * - Igual → CONTABILIZADA.
 */
export function reconciliar(valorPago: number, valorBoleto: number | null | undefined): ReconciliacaoResultado {
  if (valorBoleto == null) {
    return { status: 'PENDENTE_CONCILIACAO', motivo: 'Pagamento sem boleto correspondente para conciliação.' };
  }
  if (Math.abs(valorPago - valorBoleto) > TOLERANCIA) {
    return {
      status: 'DIVERGENTE',
      motivo: `Valor pago (${formatBRL(valorPago)}) diferente do boleto (${formatBRL(valorBoleto)}).`,
    };
  }
  return { status: 'CONTABILIZADA' };
}

// --- Histórico mensal ---------------------------------------------------------

export interface MesReceita {
  /** 'YYYY-MM' */
  mes: string;
  total: number;
  quantidade: number;
}

/** Consolida receitas por mês de referência (mais recente primeiro). */
export function agruparPorMes(receitas: Receita[]): MesReceita[] {
  const mapa = new Map<string, MesReceita>();
  for (const r of receitas) {
    const atual = mapa.get(r.referenceMonth) ?? { mes: r.referenceMonth, total: 0, quantidade: 0 };
    atual.total += r.valor;
    atual.quantidade += 1;
    mapa.set(r.referenceMonth, atual);
  }
  return [...mapa.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

/** Total já contabilizado (exclui divergências/pendências). */
export function totalContabilizado(receitas: Receita[]): number {
  return receitas.filter((r) => r.status === 'CONTABILIZADA').reduce((s, r) => s + r.valor, 0);
}

export function formatReceita(valor: number): string {
  return formatBRL(valor);
}

/** 'YYYY-MM' → 'mês/ano' legível (pt-BR). */
export function formatMesReferencia(mes: string): string {
  const [ano, m] = mes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(m) - 1;
  return idx >= 0 && idx < 12 ? `${nomes[idx]}/${ano}` : mes;
}
