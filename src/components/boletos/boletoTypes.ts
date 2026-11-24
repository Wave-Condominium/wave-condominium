// ---------------------------------------------------------------------------
// src/components/boletos/boletoTypes.ts
//
// Tipo compartilhado (subconjunto estrutural) usado pelos utilitarios de
// boleto, pelo gerador de PDF e pelo modal de detalhes. O objeto Boleto
// completo (definido em Boletos.tsx) satisfaz esta interface por estrutura.
// ---------------------------------------------------------------------------

export interface BoletoDetalhes {
  condominiumFee: number;
  waterFee: number;
  reserveFund: number;
  otherFees: number;
}

/** Campos necessarios para exibir/gerar/imprimir um boleto. */
export interface BoletoLike {
  id: string;
  unitNumber: string;
  unitOwner: string;
  /** 'YYYY-MM' */
  referenceMonth: string;
  /** 'YYYY-MM-DD' */
  dueDate: string;
  amount: number;
  /** Linha digitavel (formato tipavel, com pontos/espacos). */
  barcode: string;
  status: string;
  description: string;
  details: BoletoDetalhes;
}

/** Status voltado ao morador, conforme regra de negocio (3 estados). */
export type StatusMorador = 'pago' | 'pendente' | 'vencido';

/** Status de um boleto em aberto, para a secao "Boletos em Aberto". */
export type StatusAberto = 'aberto' | 'proximo' | 'vencido';

/** Forma de pagamento escolhida no fluxo de pagamento. */
export type PaymentMethod = 'pix' | 'card' | 'boleto';

/**
 * Boleto completo (com dados de pagamento e ancoragem na Stellar). Estende o
 * BoletoLike com os campos opcionais preenchidos ao longo do ciclo de vida.
 * O objeto Boleto de Boletos.tsx satisfaz esta interface por estrutura.
 */
export interface BoletoFull extends BoletoLike {
  issuedAt: string;
  issuedBy: string;
  paidAt?: string;
  compensatedAt?: string;
  paymentMethod?: PaymentMethod;
  blockchainHash?: string;
  blockchainRegisteredAt?: string;
  stellarExplorerUrl?: string;
  anchorTxHash?: string;
  contentHash?: string;
  // Gestão de cobrança pelo síndico (SÍN-009).
  lastReminderAt?: string;
  acordoParcelas?: number;
  acordoPrimeiraParcela?: string;
  acordoObservacao?: string;
  acordoRegistradoEm?: string;
  acordoRegistradoPor?: string;
}
