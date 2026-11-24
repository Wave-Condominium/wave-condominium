import {
  Asset,
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Memo,
  BASE_FEE,
  Account,
} from '@stellar/stellar-sdk';
import { sha256Hex, anchorHashOnStellar } from './stellar';

/**
 * Wave · Pagamento de Boleto Condominial via Stellar
 * ---------------------------------------------------------------------------
 * Arquitetura do fluxo (testnet):
 *
 *  [Morador] → paga boleto em BRL
 *       ↓
 *  [Mock On-ramp] → simula conversão BRL → USDC
 *  (em produção: integração Abroad Finance / alfredpay)
 *       ↓
 *  [Stellar Testnet] → transferência real de USDC testnet
 *  da conta do morador → conta da administradora
 *       ↓
 *  [Ancora hash] → hash do comprovante registrado via memo_hash
 *
 * Por que USDC e não XLM:
 *   - USDC é a stablecoin de referência no ecossistema Stellar
 *   - Represents o que aconteceria em produção com BRL→USDC via Abroad
 *   - Na testnet, USDC é emitido pelo Circle em
 *     GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 *
 * Contas usadas na testnet:
 *   WAVE_STELLAR_SECRET       → conta operacional da Wave (já existe, para hashes)
 *   WAVE_ADMIN_STELLAR_SECRET → conta da administradora (recebe os pagamentos)
 *   WAVE_USDC_ISSUER          → issuer USDC testnet (Circle testnet)
 */

const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK    = Networks.TESTNET;

// ── Idempotência: evita duplo registro da mesma transação ──
// Em produção, usar Redis ou BD. Aqui usamos Set em memória (suficiente para demo).
const processedBoletoIds = new Set<string>();

// USDC na Stellar Testnet — emitido pelo Circle
// [CORREÇÃO 1] O endereço anterior (GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
// estava incorreto e divergia do endereço documentado no cabeçalho deste arquivo.
// Isso fazia a verificação de trustline (hasUsdc) nunca encontrar USDC,
// caindo sempre no fallback XLM. Corrigido para o issuer Circle testnet oficial
// documentado no próprio cabeçalho do arquivo.
const USDC_ISSUER_TESTNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_ASSET = new Asset('USDC', USDC_ISSUER_TESTNET);

// Taxa de câmbio mock: 1 USDC = R$ 5,00 (simplificado para demo)
const BRL_TO_USDC_RATE = 5.0;

function getServer() {
  return new Horizon.Server(HORIZON_URL);
}

function getOperatorKeypair(): Keypair {
  const secret = process.env.WAVE_STELLAR_SECRET;
  if (!secret) throw new Error('WAVE_STELLAR_SECRET não configurada.');
  return Keypair.fromSecret(secret);
}

function getAdminKeypair(): Keypair {
  // Conta da administradora que recebe os pagamentos.
  // Se não configurada separadamente, usa a mesma conta operacional (para demo).
  const secret = process.env.WAVE_ADMIN_STELLAR_SECRET || process.env.WAVE_STELLAR_SECRET;
  if (!secret) throw new Error('WAVE_ADMIN_STELLAR_SECRET não configurada.');
  return Keypair.fromSecret(secret);
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface PaymentResult {
  success: boolean;
  // Etapa 1: conversão BRL→USDC (mock do on-ramp)
  onRamp: {
    brlAmount: number;
    usdcAmount: number;
    rate: number;
    provider: 'abroad_mock'; // em prod: 'abroad' | 'alfredpay'
    mockTxId: string;
  };
  // Etapa 2: liquidação on-chain
  settlement?: {
    stellarTxHash: string;
    usdcAmount: string;
    fromAccount: string;
    toAccount: string;
    explorerUrl: string;
    ledger?: number;
    confirmedAt: string;
  };
  // Etapa 3: hash do comprovante ancorado
  receipt?: {
    contentHash: string;
    anchorTxHash: string;
    anchorExplorerUrl: string;
  };
  error?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Fluxo principal
// ---------------------------------------------------------------------------

/**
 * Processa o pagamento de um boleto condominial em três etapas:
 * 1. Mock do on-ramp BRL → USDC (simula Abroad Finance)
 * 2. Liquidação real na Stellar Testnet (USDC)
 * 3. Ancoragem do hash do comprovante
 */
export async function processBoletoPagamento(params: {
  boletoId: string;
  brlAmount: number;
  unitNumber: string;
  referenceMonth: string;
  payerName: string;
  // SEG-007: opcionais só para o registro de segurança da assinatura da
  // conta emissora — nunca usados na lógica de pagamento em si.
  userId?: string | null;
  condominiumId?: string | null;
}): Promise<PaymentResult> {
  const timestamp = new Date().toISOString();

  // ── Idempotência: retorna resultado anterior se já processado ──
  if (processedBoletoIds.has(params.boletoId)) {
    console.warn(`[Stellar] BoletoID ${params.boletoId} já processado — bloqueando dupla submissão`);
    return {
      success: false,
      onRamp: { brlAmount: params.brlAmount, usdcAmount: 0, rate: BRL_TO_USDC_RATE, provider: 'abroad_mock', mockTxId: '' },
      error: 'Pagamento já processado para este boleto.',
      timestamp,
    };
  }

  // -------------------------------------------------------------------------
  // ETAPA 1: Mock On-ramp BRL → USDC
  // -------------------------------------------------------------------------
  // Em produção, esta etapa seria uma chamada real à API do Abroad Finance:
  // POST https://api.abroad.finance/v1/payment-intent
  // { amount_brl: params.brlAmount, destination_stellar: adminPubKey }
  //
  // Na testnet, simulamos a conversão e geramos um ID de transação fictício
  // que representa o comprovante do on-ramp.

  const usdcAmount = parseFloat((params.brlAmount / BRL_TO_USDC_RATE).toFixed(7));
  const mockOnRampTxId = `ABROAD_MOCK_${Date.now()}_${params.boletoId}`;

  const onRamp = {
    brlAmount: params.brlAmount,
    usdcAmount,
    rate: BRL_TO_USDC_RATE,
    provider: 'abroad_mock' as const,
    mockTxId: mockOnRampTxId,
  };

  // -------------------------------------------------------------------------
  // ETAPA 2: Liquidação on-chain na Stellar Testnet
  // -------------------------------------------------------------------------

  try {
    const server = getServer();
    const operatorKeypair = getOperatorKeypair();
    const adminKeypair    = getAdminKeypair();

    const fromPubKey = operatorKeypair.publicKey();
    const toPubKey   = adminKeypair.publicKey();

    // [CORREÇÃO 2] Retry com reconstrução de transação a cada tentativa.
    // Antes, a transação era assinada UMA VEZ fora do loop — se a primeira
    // tentativa falhasse com tx_bad_seq (número de sequência desatualizado),
    // reenviar a mesma transação já assinada continuaria falhando para sempre.
    // Agora a conta é recarregada e a transação é reconstruída e reassinada
    // a cada tentativa, garantindo que o retry funcione de verdade.
    //
    // [CORREÇÃO 2 — continuação] paymentAmount e assetUsed foram movidos para
    // o escopo externo do loop para ficarem acessíveis ao bloco settlement abaixo.
    let result: any;
    let lastError: any;
    let paymentAmount = usdcAmount.toFixed(7);
    let assetUsed: 'USDC' | 'XLM' = 'USDC';

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // Recarrega a conta a cada tentativa para obter o sequence number atualizado
        const account = await server.loadAccount(fromPubKey);

        // Verifica se a conta tem trustline para USDC.
        // Na testnet, se não tiver, usamos XLM como fallback e anotamos no memo.
        let paymentAsset = USDC_ASSET;

        const balances = account.balances as any[];
        const hasUsdc = balances.some(
          (b: any) =>
            b.asset_type === 'credit_alphanum4' &&
            b.asset_code === 'USDC' &&
            b.asset_issuer === USDC_ISSUER_TESTNET
        );

        if (!hasUsdc) {
          // Fallback: usa XLM nativo (sempre disponível na testnet)
          // Em produção, este cenário não ocorre pois a Abroad já entrega USDC
          paymentAsset = Asset.native();
          paymentAmount = (usdcAmount * 0.1).toFixed(7); // XLM simbólico (0.1 XLM ≈ 1 USDC em testnet)
          assetUsed = 'XLM';
        }

        // Memo no formato padrão: COND-YYYYMM-APTONUM (ex: COND-202607-APTO101)
        // Conforme spec: max 28 chars para memo_text na Stellar
        const refMonth = params.referenceMonth.replace(/[^0-9]/g, '').slice(0, 6); // YYYYMM
        const unitNum  = params.unitNumber.replace(/[^0-9]/g, '');
        const memoText = `COND-${refMonth}-APTO${unitNum}`.slice(0, 28);

        // [CORREÇÃO 3] Substituído Memo.text() por Memo.hash() na transação de pagamento.
        // Antes, o memo era um texto legível (COND-YYYYMM-APTOnnn), o que não atendia
        // ao requisito da arquitetura descrita no cabeçalho deste arquivo:
        // "[Ancora hash] → hash do comprovante registrado via memo_hash".
        // Agora o memo_hash é o SHA-256 do texto de referência do boleto,
        // convertido para Buffer de 32 bytes conforme exigido pelo protocolo Stellar.
        // O memoText continua sendo calculado e logado para fins de rastreabilidade.
        console.log(`[Stellar] Memo ref: ${memoText} | BoletoID: ${params.boletoId} | Tentativa: ${attempt}/3`);

        const memoHashBuffer = Buffer.from(
          await sha256Hex(memoText), // SHA-256 do texto de referência → string hex
          'hex'                      // converte hex → Buffer de 32 bytes (exigido pelo Stellar)
        );

        const transaction = new TransactionBuilder(account, {
          fee: String(Number(BASE_FEE) * 2), // fee um pouco maior para prioridade
          networkPassphrase: NETWORK,
        })
          .addOperation(
            Operation.payment({
              destination: toPubKey,
              asset: paymentAsset,
              amount: paymentAmount,
            })
          )
          // [CORREÇÃO 3 — continuação] Memo.hash() em vez de Memo.text()
          .addMemo(Memo.hash(memoHashBuffer))
          .setTimeout(30)
          .build();

        transaction.sign(operatorKeypair);
        result = await server.submitTransaction(transaction);
        break; // sucesso — sai do loop

      } catch (err: any) {
        lastError = err;
        console.error(`[Stellar] Tentativa ${attempt}/3 falhou:`, err?.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, attempt * 1500)); // 1.5s, 3s
        }
      }
    }

    if (!result) throw lastError;

    const settlement = {
      stellarTxHash: result.hash,
      usdcAmount: `${paymentAmount} ${assetUsed}`,
      fromAccount: fromPubKey,
      toAccount: toPubKey,
      explorerUrl: `https://stellar.expert/explorer/testnet/tx/${result.hash}`,
      ledger: result.ledger,
      confirmedAt: new Date().toISOString(),
    };

    // -----------------------------------------------------------------------
    // ETAPA 3: Ancora hash do comprovante de pagamento
    // -----------------------------------------------------------------------
    // O "comprovante" é um payload que inclui todos os dados relevantes do
    // pagamento — qualquer alteração posterior geraria um hash diferente.

    const receiptPayload = JSON.stringify({
      boletoId: params.boletoId,
      brlAmount: params.brlAmount,
      usdcAmount,
      unitNumber: params.unitNumber,
      referenceMonth: params.referenceMonth,
      payerName: params.payerName,
      stellarSettlementTx: result.hash,
      onRampTxId: mockOnRampTxId,
      paidAt: timestamp,
    });

    const contentHash = await sha256Hex(receiptPayload);
    const anchorResult = await anchorHashOnStellar(contentHash, {
      userId: params.userId ?? null,
      condominiumId: params.condominiumId ?? null,
      origem: "stellar-payment.processBoletoPagamento",
    });

    const receipt = anchorResult.success
      ? {
          contentHash: `0x${contentHash}`,
          anchorTxHash: anchorResult.txHash,
          anchorExplorerUrl: anchorResult.explorerUrl,
        }
      : undefined;

    // Marca como processado para garantir idempotência
    processedBoletoIds.add(params.boletoId);

    return {
      success: true,
      onRamp,
      settlement,
      receipt,
      timestamp,
    };
  } catch (err: any) {
    return {
      success: false,
      onRamp,
      error: err?.message ?? 'Erro ao processar pagamento na Stellar.',
      timestamp,
    };
  }
}

/**
 * Verifica o status de uma conta Stellar e retorna saldo XLM e USDC.
 * Útil para mostrar no painel admin que a conta está configurada.
 */
export async function getAccountBalances(publicKey: string): Promise<{
  xlm: string;
  usdc: string;
  found: boolean;
}> {
  try {
    const server = getServer();
    const account = await server.loadAccount(publicKey);
    const balances = account.balances as any[];

    const xlm = balances.find((b: any) => b.asset_type === 'native');
    const usdc = balances.find(
      (b: any) =>
        b.asset_type === 'credit_alphanum4' &&
        b.asset_code === 'USDC' &&
        b.asset_issuer === USDC_ISSUER_TESTNET
    );

    return {
      xlm: xlm ? parseFloat(xlm.balance).toFixed(2) : '0.00',
      usdc: usdc ? parseFloat(usdc.balance).toFixed(2) : '0.00',
      found: true,
    };
  } catch {
    return { xlm: '0.00', usdc: '0.00', found: false };
  }
}