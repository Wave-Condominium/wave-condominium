// ---------------------------------------------------------------------------
// src/components/treasury/transacoes.ts
//
// Histórico de Transações (MOR-053) — unifica RECEITAS e DESPESAS num único
// extrato cronológico. Lógica pura (sem React/DOM), testável e reutilizável.
//
// Fontes (dinheiro que efetivamente se movimentou):
//   - Receitas: boletos PAGOS (status === PAID_STATUS). Dinheiro que entrou.
//   - Despesas: despesas PAGAS (SÍN-011, status === 'PAGO'). Dinheiro que saiu.
//     Despesas pendentes/vencidas são obrigações, não movimentações — aparecem
//     na gestão de despesas, não no extrato.
// ---------------------------------------------------------------------------

import { PAID_STATUS } from '../boletos/boletoStatus';
import type { Boleto } from '../../hooks/useFinancialSummary';
import { ORIGEM_RECURSO_LABEL, CATEGORIA_DESPESA_LABEL, type Despesa } from './despesas';

export type TipoTransacao = 'receita' | 'despesa';

export interface Transacao {
  id: string;
  tipo: TipoTransacao;
  descricao: string;
  categoria: string;
  /** Valor absoluto em reais (o sinal é dado pelo `tipo`). */
  valor: number;
  /** Data em ISO 8601 (YYYY-MM-DD) — usada para ordenar. */
  data: string;
  /** Origem do recurso (só despesas): "Saldo disponível" / "Fundo de Reserva". */
  origem?: string;
}

/** Normaliza um timestamp ISO para apenas a data (YYYY-MM-DD). */
function apenasData(iso?: string): string {
  return (iso ?? '').slice(0, 10);
}

/** Converte um boleto pago em uma transação de receita. */
export function boletoParaTransacao(b: Boleto): Transacao {
  return {
    id: `receita:${b.id}`,
    tipo: 'receita',
    descricao: b.description || `Taxa condominial — Unidade ${b.unitNumber}`,
    categoria: 'Taxa condominial',
    valor: b.amount,
    // Preferimos a data de compensação/pagamento; caímos para a emissão.
    data: apenasData(b.compensatedAt ?? b.paidAt ?? b.issuedAt),
  };
}

/** Converte uma despesa em uma transação de despesa. */
export function despesaParaTransacao(d: Despesa): Transacao {
  return {
    id: `despesa:${d.id}`,
    tipo: 'despesa',
    descricao: d.descricao,
    categoria: CATEGORIA_DESPESA_LABEL[d.categoria],
    valor: d.valor,
    // Movimentação = data do pagamento; cai para o vencimento se ausente.
    data: d.dataPagamento ?? d.dataVencimento,
    origem: ORIGEM_RECURSO_LABEL[d.origemRecurso],
  };
}

/**
 * Monta o histórico unificado (receitas pagas + despesas), ordenado da
 * movimentação mais recente para a mais antiga. Não muta as entradas.
 */
export function construirHistorico(boletos: Boleto[], despesas: Despesa[]): Transacao[] {
  const receitas = boletos
    .filter((b) => b.status === PAID_STATUS)
    .map(boletoParaTransacao);
  const saidas = despesas
    .filter((d) => d.status === 'PAGO')
    .map(despesaParaTransacao);

  return [...receitas, ...saidas].sort((a, b) => {
    if (a.data === b.data) return 0;
    return a.data < b.data ? 1 : -1; // desc — mais recente primeiro
  });
}
