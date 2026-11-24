// ---------------------------------------------------------------------------
// src/components/treasury/conciliacao.ts
//
// Conciliação Boletos × Tesouraria (SÍN-010) — lógica PURA e testável.
//
// Fonte única de verdade: o BOLETO. Todo boleto liquidado projeta exatamente
// UM lançamento de receita na Tesouraria (mesmos valor/data/unidade/categoria e
// uma referência ao boleto de origem). Como o lançamento é uma projeção
// determinística do boleto, garante-se por construção: 1 receita por boleto,
// sem duplicidade e com os mesmos dados.
//
// A rotina `conciliar` compara os boletos liquidados com os lançamentos e
// identifica divergências — útil como verificação de consistência e para
// detectar qualquer origem de dado que fuja da fonte única.
// ---------------------------------------------------------------------------

import { PAID_STATUS } from '../boletos/boletoStatus';

/** Categoria de receita correspondente a um boleto de condomínio. */
export const CATEGORIA_RECEITA_BOLETO = 'Taxa condominial';

/** Subconjunto estrutural de um boleto necessário para a conciliação. */
export interface BoletoConciliavel {
  id: string;
  unitNumber: string;
  amount: number;
  status: string;
  paidAt?: string;
  compensatedAt?: string;
  issuedAt: string;
  description: string;
}

/** Lançamento de receita na Tesouraria (projeção de um boleto liquidado). */
export interface LancamentoReceita {
  /** 'receita:<boletoId>' — referência e chave de unicidade (evita duplicidade). */
  id: string;
  /** Referência ao boleto de origem. */
  boletoId: string;
  unidade: string;
  valor: number;
  /** 'YYYY-MM-DD' — data de liquidação/pagamento. */
  data: string;
  categoria: string;
  descricao: string;
}

function apenasData(iso?: string): string {
  return (iso ?? '').slice(0, 10);
}

/** Um boleto está "liquidado" quando o pagamento foi confirmado/registrado. */
export function isBoletoLiquidado(b: Pick<BoletoConciliavel, 'status'>): boolean {
  return b.status === PAID_STATUS;
}

/** Projeção canônica: boleto liquidado -> lançamento de receita. */
export function boletoParaLancamento(b: BoletoConciliavel): LancamentoReceita {
  return {
    id: `receita:${b.id}`,
    boletoId: b.id,
    unidade: b.unitNumber,
    valor: b.amount,
    data: apenasData(b.compensatedAt ?? b.paidAt ?? b.issuedAt),
    categoria: CATEGORIA_RECEITA_BOLETO,
    descricao: b.description || `Taxa condominial — Unidade ${b.unitNumber}`,
  };
}

/**
 * Fonte única: lançamentos de receita derivados dos boletos LIQUIDADOS.
 * A chave por boletoId (Map) garante no máximo um lançamento por boleto.
 */
export function lancamentosDeBoletos(boletos: BoletoConciliavel[]): LancamentoReceita[] {
  const porBoleto = new Map<string, LancamentoReceita>();
  for (const b of boletos) {
    if (isBoletoLiquidado(b)) porBoleto.set(b.id, boletoParaLancamento(b));
  }
  return [...porBoleto.values()];
}

export type TipoDivergencia =
  | 'boleto_sem_lancamento'
  | 'lancamento_sem_boleto'
  | 'valor'
  | 'data'
  | 'unidade'
  | 'categoria'
  | 'duplicado';

/** Motivo legível de cada divergência (para o relatório e o alerta). */
export const DIVERGENCIA_LABEL: Record<TipoDivergencia, string> = {
  boleto_sem_lancamento: 'Boleto liquidado sem lançamento na Tesouraria',
  lancamento_sem_boleto: 'Lançamento na Tesouraria sem boleto correspondente',
  valor: 'Divergência de valor',
  data: 'Divergência de data de liquidação',
  unidade: 'Divergência de unidade',
  categoria: 'Divergência de categoria',
  duplicado: 'Lançamentos duplicados para o mesmo boleto',
};

export type StatusConciliacao = 'conciliado' | 'divergente';

export interface ItemConciliacao {
  /** Chave do item (boletoId, ou id do lançamento órfão). */
  chave: string;
  boletoId?: string;
  unidade: string;
  valor: number;
  dataLiquidacao: string;
  /** Situação do boleto ('Liquidado' / 'Sem boleto'). */
  situacaoBoleto: string;
  /** Situação na Tesouraria ('Lançado' / 'Ausente' / 'Duplicado (N)'). */
  situacaoTesouraria: string;
  divergencias: TipoDivergencia[];
  status: StatusConciliacao;
}

export interface ResultadoConciliacao {
  itens: ItemConciliacao[];
  naoConciliados: ItemConciliacao[];
  totalBoletosLiquidados: number;
  totalLancamentos: number;
  totalConciliados: number;
  totalDivergentes: number;
}

const EPSILON = 0.001;

/**
 * Concilia os boletos liquidados com os lançamentos de receita, apontando
 * todas as divergências. `boletosLiquidados` devem ser apenas os liquidados.
 */
export function conciliar(
  boletosLiquidados: BoletoConciliavel[],
  lancamentos: LancamentoReceita[],
): ResultadoConciliacao {
  const lancPorBoleto = new Map<string, LancamentoReceita[]>();
  const lancSemBoletoId: LancamentoReceita[] = [];
  for (const l of lancamentos) {
    if (l.boletoId) {
      const arr = lancPorBoleto.get(l.boletoId) ?? [];
      arr.push(l);
      lancPorBoleto.set(l.boletoId, arr);
    } else {
      lancSemBoletoId.push(l);
    }
  }

  const itens: ItemConciliacao[] = [];
  const boletoIds = new Set<string>();

  for (const b of boletosLiquidados) {
    boletoIds.add(b.id);
    const esperado = boletoParaLancamento(b);
    const encontrados = lancPorBoleto.get(b.id) ?? [];
    const divergencias: TipoDivergencia[] = [];

    if (encontrados.length === 0) {
      divergencias.push('boleto_sem_lancamento');
    } else {
      if (encontrados.length > 1) divergencias.push('duplicado');
      const l = encontrados[0];
      if (Math.abs(l.valor - esperado.valor) > EPSILON) divergencias.push('valor');
      if (l.data !== esperado.data) divergencias.push('data');
      if (l.unidade !== esperado.unidade) divergencias.push('unidade');
      if (l.categoria !== esperado.categoria) divergencias.push('categoria');
    }

    itens.push({
      chave: b.id,
      boletoId: b.id,
      unidade: esperado.unidade,
      valor: esperado.valor,
      dataLiquidacao: esperado.data,
      situacaoBoleto: 'Liquidado',
      situacaoTesouraria:
        encontrados.length === 0 ? 'Ausente' : encontrados.length > 1 ? `Duplicado (${encontrados.length})` : 'Lançado',
      divergencias,
      status: divergencias.length ? 'divergente' : 'conciliado',
    });
  }

  // Lançamentos órfãos: sem boletoId, ou referindo um boleto que não está entre
  // os liquidados (lançamento na Tesouraria sem boleto correspondente).
  const orfaos: LancamentoReceita[] = [
    ...lancSemBoletoId,
    ...lancamentos.filter((l) => l.boletoId && !boletoIds.has(l.boletoId)),
  ];
  const vistos = new Set<string>();
  for (const l of orfaos) {
    if (vistos.has(l.id)) continue;
    vistos.add(l.id);
    itens.push({
      chave: l.id,
      boletoId: l.boletoId || undefined,
      unidade: l.unidade,
      valor: l.valor,
      dataLiquidacao: l.data,
      situacaoBoleto: 'Sem boleto',
      situacaoTesouraria: 'Lançado',
      divergencias: ['lancamento_sem_boleto'],
      status: 'divergente',
    });
  }

  const naoConciliados = itens.filter((i) => i.status === 'divergente');
  return {
    itens,
    naoConciliados,
    totalBoletosLiquidados: boletosLiquidados.length,
    totalLancamentos: lancamentos.length,
    totalConciliados: itens.filter((i) => i.status === 'conciliado').length,
    totalDivergentes: naoConciliados.length,
  };
}
