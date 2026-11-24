import {
  Asset,
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Memo,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import { registrarEventoSeguranca } from '@/server/security/registrarEventoSeguranca';

/**
 * Wave · Camada de Ancoragem na Stellar
 * ---------------------------------------------------------------------------
 * O que ESTE módulo faz:
 *   - Pega um hash (SHA-256) de um conteúdo já existente (ata, voto, recibo,
 *     prestação de contas) e ancora esse hash na rede Stellar através de uma
 *     transação simples assinada pela conta operacional da Wave.
 *
 * O que ESTE módulo NÃO faz (por design):
 *   - Não guarda o documento em si na blockchain (apenas o hash).
 *   - Não pede carteira do morador/síndico — só a conta operacional da Wave
 *     assina, conforme a arquitetura "blockchain invisível" do produto.
 *   - Não move dinheiro. Pagamento de boleto continua nos trilhos
 *     tradicionais (PIX/boleto); aqui só ancoramos o hash do comprovante.
 *
 * Por que Stellar:
 *   - Taxa de transação na faixa de fração de centavo de dólar.
 *   - Confirmação em poucos segundos.
 *   - O campo de memo (memo_hash) aceita exatamente 32 bytes — o tamanho
 *     de um hash SHA-256 — então não precisamos de smart contracts (Soroban)
 *     nesta fase. Isso é puro "timestamping" criptográfico.
 */

// ---------------------------------------------------------------------------
// Configuração de rede
// ---------------------------------------------------------------------------

const HORIZON_TESTNET_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

function getServer() {
  return new Horizon.Server(HORIZON_TESTNET_URL);
}

// ---------------------------------------------------------------------------
// Conta operacional da Wave
// ---------------------------------------------------------------------------
// Em produção, a chave secreta (WAVE_STELLAR_SECRET) deve vir de um cofre de
// segredos (ex: Vercel Env Vars criptografadas, AWS Secrets Manager) — nunca
// hardcoded e nunca enviada ao cliente. Este módulo só roda em Server Actions
// (runtime de servidor), então a chave nunca chega ao navegador do usuário.

function getOperatorKeypair(): Keypair {
  const secret = process.env.WAVE_STELLAR_SECRET;

  if (!secret) {
    throw new Error(
      'WAVE_STELLAR_SECRET não configurada. Gere uma conta de testnet em ' +
        'https://laboratory.stellar.org/#account-creator?network=test e ' +
        'defina a variável de ambiente antes de ancorar hashes na Stellar.'
    );
  }

  return Keypair.fromSecret(secret);
}

// ---------------------------------------------------------------------------
// Ancoragem de hash (função principal)
// ---------------------------------------------------------------------------

export interface AnchorResult {
  success: boolean;
  txHash: string; // hash da transação Stellar (não confundir com o hash do documento)
  ledger?: number; // "bloco" da Stellar onde a transação foi incluída
  explorerUrl: string;
  timestamp: string;
  network: 'testnet' | 'mainnet';
  error?: string;
}

/**
 * Ancora um hash de 32 bytes (ex: SHA-256 hex de 64 caracteres) na Stellar,
 * usando o campo memo_hash de uma transação simples.
 *
 * SEG-007 — `contexto` é opcional (todos os chamadores hoje já passam
 * sessão disponível) e serve só para o registro de segurança: quem pediu a
 * assinatura, de qual condomínio, e a origem (qual fluxo chamou). A chave
 * privada em si NUNCA entra no evento — só metadados sobre a solicitação.
 */
export interface ContextoAssinatura {
  userId?: string | null;
  condominiumId?: string | null;
  origem: string; // ex.: "blockchain.registerVoteOnChain", "despesas.anexarComprovante"
}

export async function anchorHashOnStellar(
  hashHex: string,
  contexto?: ContextoAssinatura
): Promise<AnchorResult> {
  const network: 'testnet' | 'mainnet' = 'testnet';

  try {
    console.log('[Stellar] anchorHashOnStellar chamado, hash:', hashHex);
    const cleanHash = hashHex.replace(/^0x/, '');

    if (cleanHash.length !== 64) {
      throw new Error(
        `Hash inválido: esperado 64 caracteres hex (SHA-256), recebido ${cleanHash.length}.`
      );
    }

    const server = getServer();
    const operatorKeypair = getOperatorKeypair();
    const operatorPublicKey = operatorKeypair.publicKey();

    const account = await server.loadAccount(operatorPublicKey);

    const memoBuffer = Buffer.from(cleanHash, 'hex'); // exatamente 32 bytes

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      // [CORREÇÃO 1] Substituído Operation.payment() por Operation.manageData().
      // Antes, o código tentava fazer um pagamento de 0.0000001 XLM da conta
      // operacional para ela mesma (destination: operatorPublicKey), o que causa
      // erro op_src_equals_dest na Stellar — uma conta não pode ser origem e
      // destino ao mesmo tempo em uma operação de payment.
      // Operation.manageData() é a operação correta para este caso: ela grava
      // uma entrada de dados arbitrária (chave/valor) na própria conta, sem
      // mover fundos, e carrega o memo_hash que é o que realmente importa aqui.
      // A chave 'wave_anchor' identifica o propósito da entrada no ledger.
      .addOperation(
        Operation.manageData({
          name: 'wave_anchor',
          value: memoBuffer, // 32 bytes do hash SHA-256 do documento
        })
      )
      .addMemo(Memo.hash(memoBuffer))
      .setTimeout(30)
      .build();

    transaction.sign(operatorKeypair);

    const result = await server.submitTransaction(transaction);

    if (contexto) {
      await registrarEventoSeguranca({
        tipo: 'ASSINATURA_EMISSORA_SUCESSO',
        resultado: 'SUCESSO',
        userId: contexto.userId ?? null,
        condominiumId: contexto.condominiumId ?? null,
        recurso: contexto.origem,
        metadata: { stellarTxHash: result.hash, ledger: result.ledger ?? null },
      });
    }

    return {
      success: true,
      txHash: result.hash,
      ledger: result.ledger,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
      timestamp: new Date().toISOString(),
      network,
    };
  } catch (err: any) {
    if (contexto) {
      await registrarEventoSeguranca({
        tipo: 'ASSINATURA_EMISSORA_FALHA',
        resultado: 'FALHA',
        userId: contexto.userId ?? null,
        condominiumId: contexto.condominiumId ?? null,
        recurso: contexto.origem,
        // Nunca inclua err.message bruto sem revisão: o SDK Stellar não
        // vaza a chave nas próprias mensagens (a assinatura é sempre local,
        // a chave nunca trafega pela rede), mas guardamos só uma versão
        // curta por cautela — nunca o objeto de erro inteiro.
        metadata: { motivo: String(err?.message ?? 'erro desconhecido').slice(0, 300) },
      });
    }
    return {
      success: false,
      txHash: '',
      explorerUrl: '',
      timestamp: new Date().toISOString(),
      network,
      error: err?.message ?? 'Erro desconhecido ao ancorar hash na Stellar.',
    };
  }
}

/**
 * Verifica se uma transação existe na Stellar e retorna o hash ancorado
 * (memo). Usado pelo botão "Verificar autenticidade" no app: o usuário
 * recalcula o hash do documento atual e compara com o que está ancorado.
 */
export async function verifyAnchoredHash(stellarTxHash: string): Promise<{
  found: boolean;
  memoHashHex?: string;
  ledger?: number;
  createdAt?: string;
}> {
  try {
    const server = getServer();
    const tx = await server.transactions().transaction(stellarTxHash).call();

    if (tx.memo_type !== 'hash' || !tx.memo) {
      return { found: true, ledger: tx.ledger_attr, createdAt: tx.created_at };
    }

    // O SDK retorna o memo de tipo "hash" já em base64; convertendo para hex.
    const memoHashHex = Buffer.from(tx.memo, 'base64').toString('hex');

    return {
      found: true,
      memoHashHex,
      ledger: tx.ledger_attr,
      createdAt: tx.created_at,
    };
  } catch {
    return { found: false };
  }
}

/**
 * Gera o hash SHA-256 de um conteúdo (string ou buffer), no formato
 * hexadecimal de 64 caracteres usado pelo restante do módulo.
 */
export async function sha256Hex(content: string | Buffer): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(content).digest('hex');
}

