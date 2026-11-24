// ---------------------------------------------------------------------------
// src/components/fundoReserva/fundoReserva.ts
//
// Modelo de aplicação e lógica PURA do Fundo de Reserva via Open Finance
// (MOR-023). Sem React/DOM nem imports de servidor — testável no Vitest.
//
// SOMENTE LEITURA: consulta de saldo/investimentos do condomínio. A regra de
// negócio pura vive aqui — estados da conexão, validade do snapshot (staleness),
// expiração do consentimento e quando é preciso reconectar/reautorizar.
// ---------------------------------------------------------------------------

import { formatBRL } from '@/components/treasury/despesas';

export type StatusConexao =
  | 'DESCONECTADO'
  | 'CONECTANDO'
  | 'CONECTADO'
  | 'EXPIRADO'
  | 'REVOGADO'
  | 'ERRO';

export const STATUS_CONEXAO_LABEL: Record<StatusConexao, string> = {
  DESCONECTADO: 'Não conectado',
  CONECTANDO: 'Conectando…',
  CONECTADO: 'Conectado',
  EXPIRADO: 'Consentimento expirado',
  REVOGADO: 'Consentimento revogado',
  ERRO: 'Erro na conexão',
};

export const STATUS_CONEXAO_COR: Record<StatusConexao, string> = {
  DESCONECTADO: 'bg-gray-100 text-gray-500',
  CONECTANDO: 'bg-wave-100 text-wave-600',
  CONECTADO: 'bg-emerald-100 text-emerald-700',
  EXPIRADO: 'bg-amber-100 text-amber-700',
  REVOGADO: 'bg-amber-100 text-amber-700',
  ERRO: 'bg-red-100 text-red-700',
};

/** Snapshot exibível do Fundo de Reserva (agregados + verificação). */
export interface FundoReservaView {
  saldoDisponivel: number;
  valorInvestido: number;
  total: number;
  moeda: string;
  origem: string;
  /** ISO — quando os dados foram consultados na instituição. */
  consultadoEm: string | null;
  hash: string | null;
  txHash: string | null;
  explorerUrl: string | null;
  status: StatusConexao;
  instituicao: string | null;
  /** ISO — validade do consentimento (Open Finance). */
  consentimentoExpiraEm: string | null;
}

/** Janela (horas) além da qual o snapshot é considerado desatualizado. */
export const SNAPSHOT_VALIDADE_HORAS = 12;

export function total(saldoDisponivel: number, valorInvestido: number): number {
  return saldoDisponivel + valorInvestido;
}

/** Snapshot desatualizado? (sem snapshot conta como desatualizado.) */
export function estaDesatualizado(consultadoEm: string | null, now: number = Date.now()): boolean {
  if (!consultadoEm) return true;
  const t = new Date(consultadoEm).getTime();
  if (Number.isNaN(t)) return true;
  return now - t > SNAPSHOT_VALIDADE_HORAS * 3_600_000;
}

/** Consentimento vencido pela data de expiração informada. */
export function consentimentoVencido(expiraEm: string | null, now: number = Date.now()): boolean {
  if (!expiraEm) return false;
  const t = new Date(expiraEm).getTime();
  if (Number.isNaN(t)) return false;
  return t <= now;
}

/**
 * É preciso (re)conectar/reautorizar? Verdadeiro quando não há conexão ativa ou
 * quando o consentimento expirou/foi revogado/deu erro. O card exige NÃO mostrar
 * valores como atualizados nesses casos.
 */
export function precisaReconectar(
  status: StatusConexao,
  consentimentoExpiraEm: string | null,
  now: number = Date.now(),
): boolean {
  if (status !== 'CONECTADO') return true;
  return consentimentoVencido(consentimentoExpiraEm, now);
}

/** Só exibe valores como confiáveis quando conectado, com consentimento válido. */
export function podeExibirValores(view: Pick<FundoReservaView, 'status' | 'consentimentoExpiraEm'>, now: number = Date.now()): boolean {
  return !precisaReconectar(view.status, view.consentimentoExpiraEm, now);
}

export function formatFundo(valor: number): string {
  return formatBRL(valor);
}
