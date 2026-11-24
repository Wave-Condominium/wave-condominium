"use server";

// ---------------------------------------------------------------------------
// src/app/actions/despesas.ts
//
// Server Actions de Despesas / pagamentos (SÍN-011) sobre PostgreSQL.
//
// Segurança (validada NO SERVIDOR — nunca só na UI):
//   - Escopo por condomínio: toda leitura/escrita usa session.condominiumId;
//     um condomínio nunca enxerga/edita despesa de outro (multi-tenant).
//   - Registro/edição exigem gestão (requireManager). O Morador só lê e verifica.
//
// Comprovante + integridade:
//   - O arquivo vai para o Vercel Blob (lib/blob.ts); guardamos URL + SHA-256.
//   - O SHA-256 dos bytes é ANCORADO na Stellar (lib/stellar.ts). A verificação
//     recalcula o hash do arquivo atual e compara com o valor ancorado no
//     ledger. A âncora é best-effort: se a rede falhar, a despesa/comprovante
//     são salvos mesmo assim (o hash em banco já é um registro de integridade).
//
// Requer `prisma generate` após o schema (model Despesa e enums).
// ---------------------------------------------------------------------------

import { requireSession, requireManager } from "@/server/auth/guard";
import { despesaRepository } from "@/server/repositories/despesaRepository";
import { userRepository } from "@/server/repositories/userRepository";
import { condominiumRepository } from "@/server/repositories/condominiumRepository";
import { anchorHashOnStellar, verifyAnchoredHash } from "@/lib/stellar";
import {
  uploadComprovante,
  sha256HexBuffer,
  validarComprovante,
} from "@/lib/blob";
import {
  validarNovaDespesa,
  validarPagamento,
  statusInicialDespesa,
  type Despesa,
  type NovaDespesaInput,
  type RegistrarPagamentoInput,
} from "@/components/treasury/despesas";

// --- Mapeamento DB (Prisma) ↔ aplicação -------------------------------------
// As chaves-string do módulo puro (categoria/status/forma/origem) espelham
// exatamente os enums do Prisma, então o mapeamento é direto. Convertemos
// Decimal→number e Date→ISO, e null→undefined. (Row tipada como `any` na
// fronteira do mapeamento — mesmo padrão de boletos.ts.)
function toApp(d: any): Despesa {
  return {
    id: d.id,
    categoria: d.categoria,
    descricao: d.descricao,
    fornecedor: d.fornecedor ?? undefined,
    valor: Number(d.valor),
    dataVencimento: d.dataVencimento,
    dataPagamento: d.dataPagamento ?? undefined,
    formaPagamento: d.formaPagamento ?? undefined,
    origemRecurso: d.origemRecurso,
    status: d.status,
    comprovanteNome: d.comprovanteNome ?? undefined,
    comprovanteUrl: d.comprovanteUrl ?? undefined,
    comprovanteMime: d.comprovanteMime ?? undefined,
    comprovanteTamanho: d.comprovanteTamanho ?? undefined,
    comprovanteHash: d.comprovanteHash ?? undefined,
    blockchainTxHash: d.blockchainTxHash ?? undefined,
    blockchainRegisteredAt: d.blockchainRegisteredAt
      ? new Date(d.blockchainRegisteredAt).toISOString()
      : undefined,
    stellarExplorerUrl: d.stellarExplorerUrl ?? undefined,
    registradoPor: d.registradoPor,
    aprovadaPor: d.aprovadaPor ?? undefined,
    aprovadaEm: d.aprovadaEm ? new Date(d.aprovadaEm).toISOString() : undefined,
    reprovadaPor: d.reprovadaPor ?? undefined,
    reprovadaEm: d.reprovadaEm ? new Date(d.reprovadaEm).toISOString() : undefined,
    motivoReprovacao: d.motivoReprovacao ?? undefined,
    criadoEm: new Date(d.criadoEm).toISOString(),
    atualizadoEm: new Date(d.atualizadoEm).toISOString(),
  };
}

/** Comprovante trafega como base64 (argumento da action). */
export interface ComprovanteInput {
  nome: string;
  mime: string;
  base64: string;
}

export type DespesaResult =
  | { ok: true; despesa: Despesa }
  | { ok: false; error: string };

// Campos de comprovante + âncora resultantes de um upload.
interface ComprovanteFields {
  comprovanteNome: string;
  comprovanteUrl: string;
  comprovanteMime: string;
  comprovanteTamanho: number;
  comprovanteHash: string;
  blockchainTxHash: string | null;
  blockchainRegisteredAt: Date | null;
  stellarExplorerUrl: string | null;
}

/**
 * Sobe o comprovante para o Blob e ANCORA o SHA-256 na Stellar. A âncora é
 * best-effort: se falhar, ainda retornamos os campos do comprovante (com o
 * hash), apenas sem os campos de blockchain. Retorna erro só se o upload/
 * validação falharem.
 */
async function processarComprovante(
  input: ComprovanteInput,
  contexto: { userId: string; condominiumId: string | null },
): Promise<{ ok: true; fields: ComprovanteFields } | { ok: false; error: string }> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(input.base64, "base64");
  } catch {
    return { ok: false, error: "Comprovante inválido." };
  }

  const erro = validarComprovante(input.mime, bytes.byteLength);
  if (erro) return { ok: false, error: erro };

  let armazenado;
  try {
    armazenado = await uploadComprovante({
      nome: input.nome,
      contentType: input.mime,
      bytes,
    });
  } catch (e: any) {
    return {
      ok: false,
      error:
        "Falha ao armazenar o comprovante. Verifique a configuração do armazenamento (BLOB_READ_WRITE_TOKEN).",
    };
  }

  // Âncora de integridade na Stellar (best-effort).
  let blockchainTxHash: string | null = null;
  let blockchainRegisteredAt: Date | null = null;
  let stellarExplorerUrl: string | null = null;
  try {
    const anchor = await anchorHashOnStellar(armazenado.hash, {
      userId: contexto.userId,
      condominiumId: contexto.condominiumId,
      origem: "despesas.processarComprovante",
    });
    if (anchor.success) {
      blockchainTxHash = anchor.txHash;
      stellarExplorerUrl = anchor.explorerUrl;
      blockchainRegisteredAt = anchor.timestamp ? new Date(anchor.timestamp) : new Date();
    }
  } catch (e) {
    console.error("[SÍN-011] Falha ao ancorar comprovante na Stellar", e);
  }

  return {
    ok: true,
    fields: {
      comprovanteNome: input.nome,
      comprovanteUrl: armazenado.url,
      comprovanteMime: armazenado.mime,
      comprovanteTamanho: armazenado.tamanho,
      comprovanteHash: armazenado.hash,
      blockchainTxHash,
      blockchainRegisteredAt,
      stellarExplorerUrl,
    },
  };
}

// --- Leitura -----------------------------------------------------------------

/** Lista as despesas do condomínio ativo (qualquer usuário autenticado do condo). */
export async function listDespesasAction(): Promise<Despesa[]> {
  const session = await requireSession();
  if (!session.condominiumId) return [];
  const rows = await despesaRepository.listByCondominium(session.condominiumId);
  return rows.map(toApp);
}

// --- Criação (gestor) --------------------------------------------------------

export interface CriarDespesaInput extends NovaDespesaInput {
  comprovante?: ComprovanteInput;
}

/** Registra uma nova despesa. Exclusivo de gestor (Síndico/Administradora/Admin). */
export async function criarDespesaAction(input: CriarDespesaInput): Promise<DespesaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const erro = validarNovaDespesa(input);
  if (erro) return { ok: false, error: erro };

  const responsavel = await userRepository.findById(session.userId);
  // SÍN-026: despesa acima da alçada do condomínio nasce AGUARDANDO_APROVACAO.
  const alcada = await condominiumRepository.getAlcada(session.condominiumId);
  const status = statusInicialDespesa(input, alcada);

  let comprovanteFields: Partial<ComprovanteFields> = {};
  if (input.comprovante) {
    const proc = await processarComprovante(input.comprovante, {
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
    });
    if (!proc.ok) return { ok: false, error: proc.error };
    comprovanteFields = proc.fields;
  }

  const row = await despesaRepository.create({
    condominiumId: session.condominiumId,
    categoria: input.categoria,
    descricao: input.descricao.trim(),
    fornecedor: input.fornecedor?.trim() || null,
    valor: input.valor,
    dataVencimento: input.dataVencimento,
    dataPagamento: input.dataPagamento || null,
    formaPagamento: input.formaPagamento ?? null,
    origemRecurso: input.origemRecurso,
    status,
    registradoPor: responsavel?.name ?? "Gestor",
    ...comprovanteFields,
  });

  return { ok: true, despesa: toApp(row) };
}

// --- Registrar pagamento de uma despesa pendente (gestor) --------------------

export interface RegistrarPagamentoActionInput extends RegistrarPagamentoInput {
  comprovante?: ComprovanteInput;
}

/** Marca uma despesa como paga (data + forma + origem), opcionalmente anexando comprovante. */
export async function registrarPagamentoDespesaAction(
  id: string,
  input: RegistrarPagamentoActionInput,
): Promise<DespesaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const erro = validarPagamento(input);
  if (erro) return { ok: false, error: erro };

  const despesa = await despesaRepository.findById(id, session.condominiumId);
  if (!despesa) return { ok: false, error: "Despesa não encontrada." };

  // SÍN-026: só despesas pendentes podem ser pagas. Uma despesa aguardando
  // aprovação (acima da alçada) precisa ser aprovada antes; uma reprovada não paga.
  if (despesa.status === "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Esta despesa aguarda aprovação do síndico antes de ser paga." };
  }
  if (despesa.status === "REPROVADA") {
    return { ok: false, error: "Esta despesa foi reprovada e não pode ser paga." };
  }

  let comprovanteFields: Partial<ComprovanteFields> = {};
  if (input.comprovante) {
    const proc = await processarComprovante(input.comprovante, {
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
    });
    if (!proc.ok) return { ok: false, error: proc.error };
    comprovanteFields = proc.fields;
  }

  await despesaRepository.update(id, session.condominiumId, {
    status: "PAGO",
    dataPagamento: input.dataPagamento,
    ...(input.formaPagamento ? { formaPagamento: input.formaPagamento } : {}),
    ...(input.origemRecurso ? { origemRecurso: input.origemRecurso } : {}),
    ...comprovanteFields,
  });

  const atualizado = await despesaRepository.findById(id, session.condominiumId);
  return atualizado
    ? { ok: true, despesa: toApp(atualizado) }
    : { ok: false, error: "Falha ao registrar o pagamento." };
}

// --- Aprovação / reprovação de despesa acima da alçada (SÍN-026, gestor) -----

/** Aprova uma despesa que aguardava aprovação → volta ao fluxo normal (PENDENTE). */
export async function aprovarDespesaAction(id: string): Promise<DespesaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  const despesa = await despesaRepository.findById(id, session.condominiumId);
  if (!despesa) return { ok: false, error: "Despesa não encontrada." };
  if (despesa.status !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível aprovar despesas que aguardam aprovação." };
  }

  const responsavel = await userRepository.findById(session.userId);
  await despesaRepository.update(id, session.condominiumId, {
    status: "PENDENTE",
    aprovadaPor: responsavel?.name ?? "Gestor",
    aprovadaEm: new Date(),
  });

  const atualizado = await despesaRepository.findById(id, session.condominiumId);
  return atualizado
    ? { ok: true, despesa: toApp(atualizado) }
    : { ok: false, error: "Falha ao aprovar a despesa." };
}

/** Reprova uma despesa acima da alçada (motivo obrigatório; preserva o registro). */
export async function reprovarDespesaAction(id: string, motivo: string): Promise<DespesaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }
  if (!motivo || motivo.trim().length < 3) {
    return { ok: false, error: "Informe o motivo da reprovação." };
  }
  const despesa = await despesaRepository.findById(id, session.condominiumId);
  if (!despesa) return { ok: false, error: "Despesa não encontrada." };
  if (despesa.status !== "AGUARDANDO_APROVACAO") {
    return { ok: false, error: "Só é possível reprovar despesas que aguardam aprovação." };
  }

  const responsavel = await userRepository.findById(session.userId);
  await despesaRepository.update(id, session.condominiumId, {
    status: "REPROVADA",
    reprovadaPor: responsavel?.name ?? "Gestor",
    reprovadaEm: new Date(),
    motivoReprovacao: motivo.trim(),
  });

  const atualizado = await despesaRepository.findById(id, session.condominiumId);
  return atualizado
    ? { ok: true, despesa: toApp(atualizado) }
    : { ok: false, error: "Falha ao reprovar a despesa." };
}

// --- Anexar/atualizar comprovante de uma despesa existente (gestor) ----------

export async function anexarComprovanteDespesaAction(
  id: string,
  comprovante: ComprovanteInput,
): Promise<DespesaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const despesa = await despesaRepository.findById(id, session.condominiumId);
  if (!despesa) return { ok: false, error: "Despesa não encontrada." };

  const proc = await processarComprovante(comprovante, {
    userId: session.userId,
    condominiumId: session.condominiumId ?? null,
  });
  if (!proc.ok) return { ok: false, error: proc.error };

  await despesaRepository.update(id, session.condominiumId, { ...proc.fields });

  const atualizado = await despesaRepository.findById(id, session.condominiumId);
  return atualizado
    ? { ok: true, despesa: toApp(atualizado) }
    : { ok: false, error: "Falha ao anexar o comprovante." };
}

// --- Verificação de integridade do comprovante -------------------------------

export type VerificacaoComprovante =
  | {
      ok: true;
      resultado: "integra" | "alterada" | "sem_registro";
      /** true se há âncora Stellar; false se a verificação usou só o hash em banco. */
      ancorado: boolean;
      ledger?: number;
      registradoEm?: string;
      explorerUrl?: string;
    }
  | { ok: false; error: string };

/**
 * Verifica se o comprovante atual (no Blob) confere com o registro de
 * integridade. Qualquer usuário autenticado do condomínio pode verificar
 * (transparência). Recalcula o SHA-256 do arquivo e compara com o hash
 * ancorado na Stellar (fonte da verdade) — ou, se não houver âncora, com o
 * hash gravado em banco.
 */
export async function verificarComprovanteDespesaAction(
  id: string,
): Promise<VerificacaoComprovante> {
  const session = await requireSession();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const despesa = await despesaRepository.findById(id, session.condominiumId);
  if (!despesa) return { ok: false, error: "Despesa não encontrada." };
  if (!despesa.comprovanteUrl || !despesa.comprovanteHash) {
    return { ok: true, resultado: "sem_registro", ancorado: false };
  }

  // Recalcula o hash do arquivo atual.
  let hashAtual: string;
  try {
    const resp = await fetch(despesa.comprovanteUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const bytes = Buffer.from(await resp.arrayBuffer());
    hashAtual = sha256HexBuffer(bytes);
  } catch (e) {
    return { ok: false, error: "Não foi possível ler o comprovante para verificação." };
  }

  // Com âncora Stellar: compara com o hash gravado no ledger (imutável).
  if (despesa.blockchainTxHash) {
    const anchored = await verifyAnchoredHash(despesa.blockchainTxHash);
    if (!anchored.found) {
      return { ok: true, resultado: "sem_registro", ancorado: false };
    }
    const integra = anchored.memoHashHex === hashAtual;
    return {
      ok: true,
      resultado: integra ? "integra" : "alterada",
      ancorado: true,
      ledger: anchored.ledger,
      registradoEm: anchored.createdAt,
      explorerUrl: despesa.stellarExplorerUrl ?? undefined,
    };
  }

  // Sem âncora: compara com o hash gravado em banco.
  const integra = hashAtual === despesa.comprovanteHash;
  return { ok: true, resultado: integra ? "integra" : "alterada", ancorado: false };
}
