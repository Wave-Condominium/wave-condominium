// ---------------------------------------------------------------------------
// src/components/boletos/boletoStatus.ts
//
// Fonte ÚNICA e pura do status de "boleto liquidado" (pago e registrado).
//
// Isolado num módulo sem dependências de servidor/React para poder ser
// importado por lógica pura testável (conciliacao.ts, transacoes.ts) sem puxar
// server actions (Prisma) para o ambiente de testes.
// ---------------------------------------------------------------------------

/** Status de um boleto liquidado (pagamento confirmado e registrado). */
export const PAID_STATUS = 'blockchain_registered';
