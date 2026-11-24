"use server";

/**
 * Wave - Server Actions de Ancoragem na Blockchain (Stellar)
 * Agora protegidas: toda action exige sessao; acoes de gestao exigem gestor.
 *
 * SEG-007: cada chamada de anchorHashOnStellar passa `contexto` (userId,
 * condominiumId, origem) para o registro de segurança da conta emissora —
 * ver src/lib/stellar.ts.
 */

import { anchorHashOnStellar, sha256Hex, verifyAnchoredHash } from "@/lib/stellar";
import { requireSession, requireManager } from "@/server/auth/guard";

export async function registerVoteOnChain(proposalId: string, vote: string, userId: string) {
  const session = await requireSession(); // qualquer morador autenticado pode votar
  const payload = JSON.stringify({ proposalId, vote, userId, ts: Date.now() });
  const hash = await sha256Hex(payload);
  const result = await anchorHashOnStellar(hash, {
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
    origem: "blockchain.registerVoteOnChain",
  });

  return {
    success: result.success,
    txHash: result.txHash,
    documentHash: `0x${hash}`,
    explorerUrl: result.explorerUrl,
    timestamp: result.timestamp,
    error: result.error,
  };
}

export async function createProposalOnChain(proposalData: any, userId: string) {
  const session = await requireManager(); // aprovar/registrar proposta e ato de gestao
  const payload = JSON.stringify({ proposalData, userId, ts: Date.now() });
  const hash = await sha256Hex(payload);
  const result = await anchorHashOnStellar(hash, {
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
    origem: "blockchain.createProposalOnChain",
  });

  return {
    success: result.success,
    txHash: result.txHash,
    documentHash: `0x${hash}`,
    proposalId: Date.now().toString(),
    explorerUrl: result.explorerUrl,
    timestamp: result.timestamp,
    error: result.error,
  };
}

export async function registerDocumentOnChain(docHash: string, userId: string) {
  const session = await requireManager(); // registrar ata/prestacao de contas e ato de gestao
  const cleanHash = docHash.replace(/^0x/, "");
  const result = await anchorHashOnStellar(cleanHash, {
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
    origem: "blockchain.registerDocumentOnChain",
  });

  return {
    success: result.success,
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    timestamp: result.timestamp,
    error: result.error,
  };
}

export async function verifyDocumentOnChain(stellarTxHash: string, currentContentHash: string) {
  await requireSession(); // verificar autenticidade: qualquer autenticado
  const anchored = await verifyAnchoredHash(stellarTxHash);
  const cleanCurrentHash = currentContentHash.replace(/^0x/, "");

  if (!anchored.found) {
    return { verified: false, reason: "Transacao nao encontrada na Stellar." };
  }

  const matches = anchored.memoHashHex === cleanCurrentHash;

  return {
    verified: matches,
    reason: matches
      ? "Hash corresponde ao conteudo atual. Documento nao foi alterado."
      : "Hash NAO corresponde. O conteudo pode ter sido alterado apos o registro.",
    ledger: anchored.ledger,
    createdAt: anchored.createdAt,
  };
}

export async function hashDocument(content: string) {
  await requireSession();
  const hash = await sha256Hex(content);
  return `0x${hash}`;
}

export async function anchorMetadataOnChain(metadata: Record<string, unknown>) {
  const session = await requireSession();
  const payload = JSON.stringify(metadata);
  const hash = await sha256Hex(payload);
  const result = await anchorHashOnStellar(hash, {
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
    origem: "blockchain.anchorMetadataOnChain",
  });

  return {
    success: result.success,
    txHash: result.txHash,
    documentHash: `0x${hash}`,
    explorerUrl: result.explorerUrl,
    ledger: result.ledger,
    timestamp: result.timestamp,
    error: result.error,
  };
}
