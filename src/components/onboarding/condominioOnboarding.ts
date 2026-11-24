// ---------------------------------------------------------------------------
// src/components/onboarding/condominioOnboarding.ts
//
// Modelo de aplicação e lógica PURA do onboarding do condomínio (SÍN-030).
// Sem React/DOM nem imports de servidor — testável no Vitest.
//
// Cobre: os dados do cadastro (condomínio, endereço, banco, responsável), a
// validação (CNPJ, e-mail, CEP, consentimento) e a MÁQUINA DE ESTADOS do vínculo
// com o PSP. A criação real da subconta é simulada por um adapter no servidor
// (src/server/psp) — aqui ficam só os estados e as transições, extensíveis à
// integração real sem retrabalho.
// ---------------------------------------------------------------------------

import { isValidCNPJ, isValidEmail, isValidCEP } from '@/lib/validators';

// --- PSP: máquina de estados -------------------------------------------------

export type PspStatus =
  | 'NAO_INICIADO'
  | 'SUBCONTA_CRIANDO'
  | 'KYC_PENDENTE'
  | 'EM_ANALISE'
  | 'APTO'
  | 'RECUSADO';

export const PSP_STATUS_LABEL: Record<PspStatus, string> = {
  NAO_INICIADO: 'Não iniciado',
  SUBCONTA_CRIANDO: 'Criando subconta',
  KYC_PENDENTE: 'KYC pendente',
  EM_ANALISE: 'Em análise',
  APTO: 'Apto a operar',
  RECUSADO: 'Recusado',
};

export const PSP_STATUS_COR: Record<PspStatus, string> = {
  NAO_INICIADO: 'bg-gray-100 text-gray-500',
  SUBCONTA_CRIANDO: 'bg-wave-100 text-wave-600',
  KYC_PENDENTE: 'bg-amber-100 text-amber-700',
  EM_ANALISE: 'bg-blue-100 text-blue-700',
  APTO: 'bg-emerald-100 text-emerald-700',
  RECUSADO: 'bg-red-100 text-red-700',
};

// Caminho "feliz" do fluxo (cada etapa avança para a próxima). RECUSADO é
// terminal e sai deste caminho.
const FLUXO_PSP: PspStatus[] = [
  'NAO_INICIADO',
  'SUBCONTA_CRIANDO',
  'KYC_PENDENTE',
  'EM_ANALISE',
  'APTO',
];

/** Próximo status do fluxo simulado, ou null se for terminal (APTO/RECUSADO). */
export function proximoStatusPsp(atual: PspStatus): PspStatus | null {
  if (atual === 'APTO' || atual === 'RECUSADO') return null;
  const i = FLUXO_PSP.indexOf(atual);
  return i >= 0 && i < FLUXO_PSP.length - 1 ? FLUXO_PSP[i + 1] : null;
}

/**
 * Regra do card: o condomínio SÓ está apto a operações financeiras quando o
 * onboarding do PSP conclui (status APTO). Guarda usada no servidor antes de
 * qualquer operação financeira.
 */
export function aptoParaFinanceiro(status: PspStatus): boolean {
  return status === 'APTO';
}

// --- Dados do cadastro -------------------------------------------------------

export type TipoContaBancaria = 'CORRENTE' | 'POUPANCA';
export type RelacaoResponsavel = 'SINDICO' | 'ADMINISTRADORA' | 'PROCURADOR';

export const RELACAO_RESPONSAVEL_LABEL: Record<RelacaoResponsavel, string> = {
  SINDICO: 'Síndico',
  ADMINISTRADORA: 'Administradora',
  PROCURADOR: 'Procurador / representante legal',
};

export interface EnderecoInput {
  cep: string;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface DadosBancariosInput {
  banco: string;
  agencia: string;
  conta: string;
  tipoConta: TipoContaBancaria;
  pixChave?: string;
}

export interface ResponsavelInput {
  nome: string;
  email: string;
  telefone: string;
  relacao: RelacaoResponsavel;
}

export interface NovoCondominioInput {
  nome: string;
  cnpj: string;
  endereco: EnderecoInput;
  banco: DadosBancariosInput;
  responsavel: ResponsavelInput;
  /** Consentimento/declaração de representação (arts. 1.347–1.349 CC). */
  consentimentoRepresentacao: boolean;
}

const UF_RE = /^[A-Za-z]{2}$/;

/**
 * Valida o cadastro inteiro (uma mensagem por vez, na ordem do wizard). Retorna
 * a mensagem de erro ou null. Toda regra crítica é revalidada no servidor.
 */
export function validarNovoCondominio(input: Partial<NovoCondominioInput>): string | null {
  if (!input.nome || !input.nome.trim()) return 'Informe a razão social / nome do condomínio.';
  if (!input.cnpj || !isValidCNPJ(input.cnpj)) return 'Informe um CNPJ válido.';

  const e = input.endereco;
  if (!e || !e.cep || !isValidCEP(e.cep)) return 'Informe um CEP válido.';
  if (!e.logradouro || !e.logradouro.trim()) return 'Informe o logradouro.';
  if (!e.numero || !e.numero.trim()) return 'Informe o número.';
  if (!e.bairro || !e.bairro.trim()) return 'Informe o bairro.';
  if (!e.cidade || !e.cidade.trim()) return 'Informe a cidade.';
  if (!e.uf || !UF_RE.test(e.uf.trim())) return 'Informe a UF (2 letras).';

  const b = input.banco;
  if (!b || !b.banco || !b.banco.trim()) return 'Informe o banco.';
  if (!b.agencia || !b.agencia.trim()) return 'Informe a agência.';
  if (!b.conta || !b.conta.trim()) return 'Informe a conta.';
  if (b.tipoConta !== 'CORRENTE' && b.tipoConta !== 'POUPANCA') return 'Selecione o tipo de conta.';

  const r = input.responsavel;
  if (!r || !r.nome || !r.nome.trim()) return 'Informe o nome do responsável.';
  if (!r.email || !isValidEmail(r.email)) return 'Informe um e-mail válido para o responsável.';
  if (!r.telefone || !r.telefone.trim()) return 'Informe o telefone do responsável.';
  if (r.relacao !== 'SINDICO' && r.relacao !== 'ADMINISTRADORA' && r.relacao !== 'PROCURADOR') {
    return 'Selecione a relação do responsável com o condomínio.';
  }

  if (!input.consentimentoRepresentacao) {
    return 'É necessário declarar a representação/consentimento para prosseguir.';
  }
  return null;
}

/** Normaliza o CNPJ para armazenar/comparar (só dígitos). Base da unicidade. */
export function normalizarCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '');
}
