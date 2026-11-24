// ---------------------------------------------------------------------------
// src/components/treasury/despesas.ts
//
// Despesas do condomínio — modelo de domínio e lógica PURA (SÍN-011).
//
// Este módulo NÃO importa nada de servidor (Prisma/actions), para que a lógica
// permaneça testável no Vitest sem puxar a cadeia de servidor — mesmo padrão de
// `boletoStatus.ts`. As Server Actions (`app/actions/despesas.ts`) mapeiam os
// enums do Prisma para os tipos-string deste módulo (e vice-versa).
//
// Evolução: até SÍN-011 as despesas eram um demo em localStorage. Agora são
// persistidas no PostgreSQL (multi-tenant), com comprovante no Vercel Blob e
// registro de integridade ancorado na Stellar. As chaves de categoria/forma/
// status/origem espelham exatamente os enums do schema Prisma.
// ---------------------------------------------------------------------------

// --- Categorias --------------------------------------------------------------
// Chaves iguais ao enum Prisma `CategoriaDespesa`. Os rótulos são a exibição
// pt-BR conforme o card SÍN-011.

export type CategoriaDespesa =
  | 'FOLHA_PAGAMENTO'
  | 'JARDINAGEM'
  | 'LIMPEZA'
  | 'MANUTENCAO_PREDIAL'
  | 'ELEVADORES'
  | 'SEGURANCA_PORTARIA'
  | 'AGUA_ESGOTO'
  | 'ENERGIA'
  | 'GAS'
  | 'SEGUROS'
  | 'TAXAS_TRIBUTOS'
  | 'ADMINISTRACAO'
  | 'OBRAS_BENFEITORIAS'
  | 'OUTROS';

export const CATEGORIA_DESPESA_LABEL: Record<CategoriaDespesa, string> = {
  FOLHA_PAGAMENTO: 'Folha de pagamento e encargos',
  JARDINAGEM: 'Jardinagem e paisagismo',
  LIMPEZA: 'Limpeza e conservação',
  MANUTENCAO_PREDIAL: 'Manutenção predial',
  ELEVADORES: 'Elevadores',
  SEGURANCA_PORTARIA: 'Segurança e portaria',
  AGUA_ESGOTO: 'Água e esgoto',
  ENERGIA: 'Energia elétrica',
  GAS: 'Gás',
  SEGUROS: 'Seguros',
  TAXAS_TRIBUTOS: 'Taxas e tributos',
  ADMINISTRACAO: 'Administração',
  OBRAS_BENFEITORIAS: 'Obras e benfeitorias',
  OUTROS: 'Outros',
};

/** Ordem de exibição das categorias no cadastro/consulta. */
export const CATEGORIAS_DESPESA: CategoriaDespesa[] = [
  'FOLHA_PAGAMENTO',
  'JARDINAGEM',
  'LIMPEZA',
  'MANUTENCAO_PREDIAL',
  'ELEVADORES',
  'SEGURANCA_PORTARIA',
  'AGUA_ESGOTO',
  'ENERGIA',
  'GAS',
  'SEGUROS',
  'TAXAS_TRIBUTOS',
  'ADMINISTRACAO',
  'OBRAS_BENFEITORIAS',
  'OUTROS',
];

/** Cor por categoria — para os gráficos/legendas da seção Despesas. */
export const CATEGORIA_DESPESA_COR: Record<CategoriaDespesa, string> = {
  FOLHA_PAGAMENTO: '#8b5cf6',
  JARDINAGEM: '#22c55e',
  LIMPEZA: '#06b6d4',
  MANUTENCAO_PREDIAL: '#3b82f6',
  ELEVADORES: '#6366f1',
  SEGURANCA_PORTARIA: '#0ea5e9',
  AGUA_ESGOTO: '#14b8a6',
  ENERGIA: '#f59e0b',
  GAS: '#ef4444',
  SEGUROS: '#ec4899',
  TAXAS_TRIBUTOS: '#a855f7',
  ADMINISTRACAO: '#64748b',
  OBRAS_BENFEITORIAS: '#f97316',
  OUTROS: '#94a3b8',
};

// --- Status ------------------------------------------------------------------
// Persistimos apenas PENDENTE/PAGO. "VENCIDO" é DERIVADO (não armazenado):
// status PENDENTE + dataVencimento < hoje. Mesmo padrão de `isBoletoOverdue`.

// SÍN-026 (financeiro): AGUARDANDO_APROVACAO e REPROVADA entram no fluxo de
// alçada — despesas acima do teto do condomínio dependem da decisão do síndico.
export type StatusDespesa = 'PENDENTE' | 'PAGO' | 'AGUARDANDO_APROVACAO' | 'REPROVADA';
export type StatusDespesaView = StatusDespesa | 'VENCIDO';

export const STATUS_DESPESA_LABEL: Record<StatusDespesaView, string> = {
  PENDENTE: 'Pendente',
  PAGO: 'Pago',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  REPROVADA: 'Reprovada',
  VENCIDO: 'Vencido',
};

// --- Forma de pagamento ------------------------------------------------------

export type FormaPagamentoDespesa =
  | 'PIX'
  | 'TED'
  | 'TRANSFERENCIA'
  | 'DINHEIRO'
  | 'BOLETO'
  | 'CARTAO'
  | 'DEBITO_AUTOMATICO'
  | 'OUTRO';

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamentoDespesa, string> = {
  PIX: 'PIX',
  TED: 'TED',
  TRANSFERENCIA: 'Transferência',
  DINHEIRO: 'Dinheiro',
  BOLETO: 'Boleto',
  CARTAO: 'Cartão',
  DEBITO_AUTOMATICO: 'Débito automático',
  OUTRO: 'Outro',
};

export const FORMAS_PAGAMENTO: FormaPagamentoDespesa[] = [
  'PIX',
  'TED',
  'TRANSFERENCIA',
  'DINHEIRO',
  'BOLETO',
  'CARTAO',
  'DEBITO_AUTOMATICO',
  'OUTRO',
];

// --- Origem do recurso (herdado de MOR-054) ----------------------------------

export type OrigemRecurso = 'SALDO' | 'FUNDO_RESERVA';

export const ORIGEM_RECURSO_LABEL: Record<OrigemRecurso, string> = {
  SALDO: 'Saldo disponível',
  FUNDO_RESERVA: 'Fundo de Reserva',
};

// --- Entidade de aplicação ---------------------------------------------------

export interface Despesa {
  id: string;
  categoria: CategoriaDespesa;
  descricao: string;
  /** Fornecedor ou beneficiário. */
  fornecedor?: string;
  /** Valor em reais (BRL). */
  valor: number;
  /** Data de vencimento (YYYY-MM-DD). */
  dataVencimento: string;
  /** Data de pagamento (YYYY-MM-DD) — vazia enquanto pendente. */
  dataPagamento?: string;
  formaPagamento?: FormaPagamentoDespesa;
  origemRecurso: OrigemRecurso;
  status: StatusDespesa;

  // Comprovante + integridade
  comprovanteNome?: string;
  comprovanteUrl?: string;
  comprovanteMime?: string;
  comprovanteTamanho?: number;
  /** SHA-256 (hex, 64) dos bytes do comprovante — base da verificação. */
  comprovanteHash?: string;
  /** Hash da transação Stellar que ancora o comprovante. */
  blockchainTxHash?: string;
  blockchainRegisteredAt?: string;
  stellarExplorerUrl?: string;

  registradoPor: string;

  // SÍN-026 (financeiro): rastreabilidade da decisão sobre a alçada.
  aprovadaPor?: string;
  aprovadaEm?: string;
  reprovadaPor?: string;
  reprovadaEm?: string;
  motivoReprovacao?: string;

  criadoEm: string;
  atualizadoEm: string;
}

// --- Derivações de status ----------------------------------------------------

/** Uma despesa está vencida quando ainda pendente e o vencimento já passou. */
export function isDespesaVencida(
  d: Pick<Despesa, 'status' | 'dataVencimento'>,
  hojeISO: string,
): boolean {
  return d.status === 'PENDENTE' && !!d.dataVencimento && d.dataVencimento < hojeISO;
}

/** Status para exibição (inclui o derivado VENCIDO). */
export function statusView(
  d: Pick<Despesa, 'status' | 'dataVencimento'>,
  hojeISO: string,
): StatusDespesaView {
  if (isDespesaVencida(d, hojeISO)) return 'VENCIDO';
  return d.status;
}

// --- Formatação / agregações -------------------------------------------------

/** Formata um valor em Real (BRL). */
export function formatBRL(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Soma o valor total das despesas. */
export function totalDespesas(despesas: Despesa[]): number {
  return despesas.reduce((soma, d) => soma + d.valor, 0);
}

export interface CategoriaResumo {
  categoria: CategoriaDespesa;
  label: string;
  valor: number;
  cor: string;
  /** Participação no total (0–100, arredondada). */
  percentual: number;
}

/**
 * Agrupa as despesas por categoria (valor somado, rótulo, cor e % do total),
 * da maior para a menor. Não muta a entrada.
 */
export function agruparPorCategoria(despesas: Despesa[]): CategoriaResumo[] {
  const total = totalDespesas(despesas);

  const somaPorCategoria = new Map<CategoriaDespesa, number>();
  for (const d of despesas) {
    somaPorCategoria.set(d.categoria, (somaPorCategoria.get(d.categoria) ?? 0) + d.valor);
  }

  return Array.from(somaPorCategoria.entries())
    .map(([categoria, valor]) => ({
      categoria,
      label: CATEGORIA_DESPESA_LABEL[categoria],
      valor,
      cor: CATEGORIA_DESPESA_COR[categoria],
      percentual: total > 0 ? Math.round((valor / total) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// --- Cadastro / validação (puros e testáveis) --------------------------------
// A restrição de acesso (só gestor) e a autorização são validadas no SERVIDOR
// (requireManager) — a UI apenas oculta os controles. Estas funções cuidam só
// da consistência dos dados de entrada.

export interface NovaDespesaInput {
  categoria: CategoriaDespesa;
  descricao: string;
  fornecedor?: string;
  valor: number;
  dataVencimento: string;
  /** Opcional: se informada, a despesa nasce PAGA. */
  dataPagamento?: string;
  formaPagamento?: FormaPagamentoDespesa;
  origemRecurso: OrigemRecurso;
}

/**
 * Regras (SÍN-011): valor, categoria e descrição são obrigatórios; o
 * vencimento é obrigatório; uma despesa marcada como paga (dataPagamento
 * preenchida) exige a data de pagamento. Retorna a mensagem de erro ou null.
 */
export function validarNovaDespesa(input: Partial<NovaDespesaInput>): string | null {
  if (!input.descricao || !input.descricao.trim()) return 'Informe a descrição da despesa.';
  if (input.valor == null || Number.isNaN(input.valor) || input.valor <= 0) {
    return 'Informe um valor maior que zero.';
  }
  if (!input.categoria) return 'Selecione a categoria da despesa.';
  if (!input.dataVencimento) return 'Informe a data de vencimento.';
  if (!input.origemRecurso) return 'Selecione a origem do recurso.';
  // Sem restrição de ordem entre datas: o pagamento pode ocorrer antes ou
  // depois do vencimento. A data de pagamento presente marca a despesa como paga.
  return null;
}

/** Deriva o status a partir da presença (ou não) da data de pagamento. */
export function statusDeInput(
  input: Pick<NovaDespesaInput, 'dataPagamento'>,
): StatusDespesa {
  return input.dataPagamento ? 'PAGO' : 'PENDENTE';
}

// --- Alçada de aprovação (SÍN-026, financeiro) -------------------------------

/** Uma despesa exige aprovação quando há alçada definida e o valor a ultrapassa. */
export function requerAprovacao(valor: number, alcada: number | null | undefined): boolean {
  return alcada != null && !Number.isNaN(alcada) && valor > alcada;
}

/**
 * Status inicial da despesa considerando a alçada do condomínio:
 * - com data de pagamento → PAGO (registro de um pagamento já efetuado);
 * - sem pagamento e acima da alçada → AGUARDANDO_APROVACAO;
 * - caso contrário → PENDENTE (comportamento anterior).
 */
export function statusInicialDespesa(
  input: Pick<NovaDespesaInput, 'dataPagamento' | 'valor'>,
  alcada: number | null | undefined,
): StatusDespesa {
  if (input.dataPagamento) return 'PAGO';
  if (requerAprovacao(input.valor, alcada)) return 'AGUARDANDO_APROVACAO';
  return 'PENDENTE';
}

/** Só despesas pendentes (ou vencidas, que são pendentes) podem ser pagas. */
export function despesaPodePagar(sv: StatusDespesaView): boolean {
  return sv === 'PENDENTE' || sv === 'VENCIDO';
}

// --- Registro de pagamento de uma despesa pendente ---------------------------

export interface RegistrarPagamentoInput {
  dataPagamento: string;
  formaPagamento?: FormaPagamentoDespesa;
  origemRecurso?: OrigemRecurso;
}

/** Uma despesa paga DEVE ter data de pagamento registrada (SÍN-011). */
export function validarPagamento(input: Partial<RegistrarPagamentoInput>): string | null {
  if (!input.dataPagamento) return 'Informe a data do pagamento.';
  return null;
}
