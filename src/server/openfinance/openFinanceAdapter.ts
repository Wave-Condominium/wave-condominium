// ---------------------------------------------------------------------------
// src/server/openfinance/openFinanceAdapter.ts  —  MOR-023 (server-only)
//
// SEAM de integração Open Finance (consulta SOMENTE LEITURA de saldo/investimentos
// do Fundo de Reserva). A escolha do agregador (Belvo, Pluggy, Klavi…) e a
// certificação do Banco Central ficam para a integração real; aqui expomos a
// INTERFACE e uma implementação SIMULADA. Trocar `openFinanceAdapter` pela
// implementação real não muda nada no resto do app (mesmo contrato).
//
// Nada aqui movimenta dinheiro: apenas inicia o consentimento (redirecionamento)
// e consulta agregados. Nenhuma credencial bancária transita pela Wave.
// ---------------------------------------------------------------------------

export interface IniciarConsentimentoInput {
  condominiumId: string;
  cnpj: string | null;
}

export interface IniciarConsentimentoResult {
  externalItemId: string;
  instituicao: string;
  /** Redirecionamento p/ o banco (no real). No simulado, retorno imediato. */
  redirectUrl: string;
  /** Validade do consentimento (Open Finance). */
  expiraEm: Date;
}

export interface ConsultaFundoResult {
  instituicao: string;
  saldoDisponivel: number;
  valorInvestido: number;
  consultadoEm: Date;
}

export interface OpenFinanceAdapter {
  iniciarConsentimento(input: IniciarConsentimentoInput): Promise<IniciarConsentimentoResult>;
  consultarFundo(externalItemId: string): Promise<ConsultaFundoResult>;
}

const INSTITUICAO_SIMULADA = 'Banco Simulado S.A. (Open Finance sandbox)';
const CONSENTIMENTO_DIAS = 90; // Open Finance permite até 12 meses; usamos 90 dias.

// Base determinística por condomínio (para os valores não "pularem" a cada refresh)
// + pequena variação por dia, simulando rendimento do investimento.
function baseDoCondominio(externalItemId: string): { saldo: number; investido: number } {
  let h = 0;
  for (let i = 0; i < externalItemId.length; i++) h = (h * 31 + externalItemId.charCodeAt(i)) >>> 0;
  const saldo = 40_000 + (h % 60_000); // R$ 40k–100k disponível
  const investido = 120_000 + (h % 180_000); // R$ 120k–300k investido
  return { saldo, investido };
}

export const simuladoOpenFinanceAdapter: OpenFinanceAdapter = {
  async iniciarConsentimento(input) {
    const externalItemId = `of_item_${input.condominiumId}_${Date.now().toString(36)}`;
    const expiraEm = new Date(Date.now() + CONSENTIMENTO_DIAS * 86_400_000);
    return { externalItemId, instituicao: INSTITUICAO_SIMULADA, redirectUrl: '#', expiraEm };
  },

  async consultarFundo(externalItemId) {
    const { saldo, investido } = baseDoCondominio(externalItemId);
    // Rendimento simulado do investido: ~0,04%/dia sobre a base.
    const dias = Math.floor(Date.now() / 86_400_000) % 365;
    const rendimento = Math.round(investido * 0.0004 * dias);
    return {
      instituicao: INSTITUICAO_SIMULADA,
      saldoDisponivel: saldo,
      valorInvestido: investido + rendimento,
      consultadoEm: new Date(),
    };
  },
};

// Ponto único trocado quando o agregador real entrar.
export const openFinanceAdapter: OpenFinanceAdapter = simuladoOpenFinanceAdapter;
