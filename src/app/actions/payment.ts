"use server";

import { processBoletoPagamento, getAccountBalances } from "@/lib/stellar-payment";
import { requireSession, requirePlatformAdmin } from "@/server/auth/guard";

export async function pagarBoletoViaStellar(params: {
  boletoId: string;
  brlAmount: number;
  unitNumber: string;
  referenceMonth: string;
  payerName: string;
}) {
  // C2: exige sessao valida no servidor (nao basta esconder o botao).
  // Regra fina "morador so paga o proprio boleto" entra quando o boleto
  // vier do banco.
  const session = await requireSession();
  return processBoletoPagamento({
    ...params,
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
  });
}

export async function getSaldoContaOperacional() {
  // C3: dado operacional da plataforma -> exclusivo de Admin, checado no servidor.
  await requirePlatformAdmin();

  const secret = process.env.WAVE_STELLAR_SECRET;
  if (!secret) {
    return { xlm: "0.00", usdc: "0.00", found: false, publicKey: null };
  }

  const { Keypair } = await import("@stellar/stellar-sdk");
  const kp = Keypair.fromSecret(secret);
  const publicKey = kp.publicKey();

  const balances = await getAccountBalances(publicKey);
  return { ...balances, publicKey };
}