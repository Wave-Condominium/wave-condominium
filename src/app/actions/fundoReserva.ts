"use server";

// ---------------------------------------------------------------------------
// src/app/actions/fundoReserva.ts  —  MOR-023
//
// Fundo de Reserva via Open Finance — SOMENTE LEITURA. Consulta de saldo e
// investimentos do condomínio, com snapshot verificável (hash ancorado na
// Stellar) e detecção de consentimento expirado.
//
// Segurança (NO SERVIDOR): a AUTORIZAÇÃO do Open Finance é do Síndico
// (requireManager — representação, arts. 1.347–1.349 CC). A LEITURA do painel é
// de qualquer usuário do condomínio (requireSession). Tudo escopado por
// session.condominiumId (multi-tenant). Nada aqui movimenta valores.
// ---------------------------------------------------------------------------

import { requireSession, requireManager } from "@/server/auth/guard";
import { isManager } from "@/lib/rbac";
import { fundoReservaRepository } from "@/server/repositories/fundoReservaRepository";
import { condominiumRepository } from "@/server/repositories/condominiumRepository";
import { userRepository } from "@/server/repositories/userRepository";
import { openFinanceAdapter } from "@/server/openfinance/openFinanceAdapter";
import { anchorMetadataOnChain } from "@/app/actions/blockchain";
import {
  consentimentoVencido,
  type FundoReservaView,
  type StatusConexao,
} from "@/components/fundoReserva/fundoReserva";

export type FundoReservaResult =
  | { ok: true; view: FundoReservaView; podeGerenciar: boolean }
  | { ok: false; error: string };

function toView(conexao: any, snapshot: any): FundoReservaView {
  const status = (conexao?.status ?? "DESCONECTADO") as StatusConexao;
  const saldo = snapshot ? Number(snapshot.saldoDisponivel) : 0;
  const investido = snapshot ? Number(snapshot.valorInvestido) : 0;
  return {
    saldoDisponivel: saldo,
    valorInvestido: investido,
    total: saldo + investido,
    moeda: snapshot?.moeda ?? "BRL",
    origem: snapshot?.origem ?? "Open Finance",
    consultadoEm: snapshot ? new Date(snapshot.consultadoEm).toISOString() : null,
    hash: snapshot?.hash ?? null,
    txHash: snapshot?.blockchainTxHash ?? null,
    explorerUrl: snapshot?.stellarExplorerUrl ?? null,
    status,
    instituicao: conexao?.instituicao ?? null,
    consentimentoExpiraEm: conexao?.consentimentoExpiraEm
      ? new Date(conexao.consentimentoExpiraEm).toISOString()
      : null,
  };
}

// --- Leitura (Dashboard do Morador) -----------------------------------------

export async function getFundoReservaAction(): Promise<FundoReservaResult> {
  const session = await requireSession();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado." };

  const conexao = await fundoReservaRepository.getConexao(session.condominiumId);

  // Detecta consentimento expirado e persiste a transição (evita mostrar dado
  // como atual quando a autorização já venceu).
  if (conexao && (conexao as any).status === "CONECTADO" &&
      consentimentoVencido((conexao as any).consentimentoExpiraEm?.toISOString?.() ?? null)) {
    await fundoReservaRepository.updateConexaoStatus(session.condominiumId, { status: "EXPIRADO" });
    (conexao as any).status = "EXPIRADO";
  }

  const snapshot = await fundoReservaRepository.latestSnapshot(session.condominiumId);
  return { ok: true, view: toView(conexao, snapshot), podeGerenciar: isManager(session.role) };
}

// --- Consulta + snapshot verificável ----------------------------------------

async function consultarEGravar(condominiumId: string, conexao: any): Promise<FundoReservaView> {
  const consulta = await openFinanceAdapter.consultarFundo((conexao as any).externalItemId ?? "");
  const origem = `Open Finance · ${consulta.instituicao}`;

  // Registro verificável: ancora o hash do snapshot na Stellar (best-effort).
  let hash: string | null = null;
  let txHash: string | null = null;
  let explorerUrl: string | null = null;
  try {
    const anchor = await anchorMetadataOnChain({
      tipo: "fundo_reserva_snapshot",
      condominiumId,
      saldoDisponivel: consulta.saldoDisponivel,
      valorInvestido: consulta.valorInvestido,
      origem,
      consultadoEm: consulta.consultadoEm.toISOString(),
    });
    hash = anchor.documentHash ?? null;
    txHash = anchor.txHash ?? null;
    explorerUrl = anchor.explorerUrl ?? null;
  } catch {
    // Falha na ancoragem não impede o snapshot; apenas fica sem selo on-chain.
  }

  const snap = await fundoReservaRepository.createSnapshot({
    condominiumId,
    saldoDisponivel: consulta.saldoDisponivel,
    valorInvestido: consulta.valorInvestido,
    moeda: "BRL",
    origem,
    consultadoEm: consulta.consultadoEm,
    hash: hash ?? "",
    blockchainTxHash: txHash,
    stellarExplorerUrl: explorerUrl,
  });

  return toView(conexao, snap);
}

/**
 * Atualiza o saldo/investimentos (reconsulta a instituição e grava novo snapshot).
 * Leitura — permitida a qualquer usuário do condomínio — mas exige uma conexão
 * ativa com consentimento válido; caso contrário, sinaliza reconexão.
 */
export async function atualizarFundoReservaAction(): Promise<FundoReservaResult> {
  const session = await requireSession();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado." };

  const conexao = await fundoReservaRepository.getConexao(session.condominiumId);
  const status = ((conexao as any)?.status ?? "DESCONECTADO") as StatusConexao;
  const vencido = consentimentoVencido((conexao as any)?.consentimentoExpiraEm?.toISOString?.() ?? null);

  if (!conexao || status !== "CONECTADO" || vencido) {
    if (conexao && status === "CONECTADO" && vencido) {
      await fundoReservaRepository.updateConexaoStatus(session.condominiumId, { status: "EXPIRADO" });
    }
    return { ok: false, error: "Conexão com o banco indisponível. É necessário reautorizar o acesso." };
  }

  const view = await consultarEGravar(session.condominiumId, conexao);
  return { ok: true, view, podeGerenciar: isManager(session.role) };
}

// --- Conexão / consentimento (Síndico) --------------------------------------

/**
 * Conecta o Open Finance e registra o consentimento (autorizado pelo Síndico).
 * Inicia o item no agregador e já traz a primeira consulta (snapshot).
 */
export async function conectarOpenFinanceAction(): Promise<FundoReservaResult> {
  const session = await requireManager();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado." };

  const condo = await condominiumRepository.findById(session.condominiumId);
  const user = await userRepository.findById(session.userId);

  const consent = await openFinanceAdapter.iniciarConsentimento({
    condominiumId: session.condominiumId,
    cnpj: (condo as any)?.cnpj ?? null,
  });

  const conexao = await fundoReservaRepository.upsertConexao(session.condominiumId, {
    status: "CONECTADO",
    agregador: "SIMULADO",
    instituicao: consent.instituicao,
    externalItemId: consent.externalItemId,
    consentimentoPor: session.userId,
    consentimentoPorNome: (user as any)?.name ?? "Síndico",
    consentimentoEm: new Date(),
    consentimentoExpiraEm: consent.expiraEm,
  });

  const view = await consultarEGravar(session.condominiumId, conexao);
  return { ok: true, view, podeGerenciar: true };
}

/** Revoga o consentimento/desconecta (Síndico). Estado passa a REVOGADO. */
export async function desconectarOpenFinanceAction(): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  if (!session.condominiumId) return { ok: false, error: "Condomínio ativo não identificado." };
  await fundoReservaRepository.updateConexaoStatus(session.condominiumId, {
    status: "REVOGADO",
    consentimentoExpiraEm: null,
  });
  return { ok: true };
}
