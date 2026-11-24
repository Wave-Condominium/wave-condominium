// ---------------------------------------------------------------------------
// src/components/access/convites.ts
//
// Modelo de domínio e lógica PURA dos Convites de Acesso de moradores
// (SÍN-022). Sem React/DOM nem imports de servidor — testável no Vitest.
// As chaves de vínculo/status espelham os enums do Prisma; as Server Actions
// mapeiam de/para estes tipos-string.
//
// Regra central: o Síndico gera o convite; o morador define a própria senha na
// ativação. A senha NUNCA transita/é definida pelo Síndico. Aqui ficam apenas
// validação de entrada, derivação de status e regras de transição — a geração
// e o hash do token (crypto) ficam no servidor.
// ---------------------------------------------------------------------------

import { MIN_PASSWORD_LENGTH } from '@/lib/accounts';

// --- Vínculo do morador com a unidade ----------------------------------------

export type VinculoMorador = 'PROPRIETARIO' | 'INQUILINO' | 'DEPENDENTE';

export const VINCULO_LABEL: Record<VinculoMorador, string> = {
  PROPRIETARIO: 'Proprietário',
  INQUILINO: 'Inquilino',
  DEPENDENTE: 'Dependente',
};

export const VINCULOS: VinculoMorador[] = ['PROPRIETARIO', 'INQUILINO', 'DEPENDENTE'];

// --- Troca de morador: venda (titularidade) e nova locação (SÍN-022 Fase 2) --
//
// A transferência de titularidade troca o PROPRIETÁRIO; a nova locação troca o
// INQUILINO. Em ambos os casos, o acesso do morador anterior (mesmo vínculo) é
// revogado e um novo convite é gerado para o novo morador.

export type TipoTroca = 'VENDA' | 'LOCACAO';

export const TIPO_TROCA_LABEL: Record<TipoTroca, string> = {
  VENDA: 'Transferência de titularidade',
  LOCACAO: 'Nova locação',
};

/** Vínculo afetado por cada tipo de troca. */
export function vinculoDaTroca(tipo: TipoTroca): VinculoMorador {
  return tipo === 'VENDA' ? 'PROPRIETARIO' : 'INQUILINO';
}

// --- Status do convite -------------------------------------------------------
//
// Persistidos no banco: PENDENTE | ATIVADO | REVOGADO.
// "EXPIRADO" é DERIVADO (PENDENTE + expiresAt < agora), nunca armazenado — no
// mesmo padrão de "Vencido" em Boletos/Despesas.

export type StatusConvite = 'PENDENTE' | 'ATIVADO' | 'REVOGADO';

/** Status apresentado ao Síndico (inclui o derivado EXPIRADO). */
export type StatusConviteView = StatusConvite | 'EXPIRADO';

export const STATUS_CONVITE_LABEL: Record<StatusConviteView, string> = {
  PENDENTE: 'Pendente',
  ATIVADO: 'Ativado',
  EXPIRADO: 'Expirado',
  REVOGADO: 'Revogado',
};

/** Classes de badge por status (consistente com o design system). */
export const STATUS_CONVITE_COR: Record<StatusConviteView, string> = {
  PENDENTE: 'bg-amber-100 text-amber-700',
  ATIVADO: 'bg-brand-teal/15 text-brand-teal',
  EXPIRADO: 'bg-gray-100 text-gray-600',
  REVOGADO: 'bg-red-100 text-red-700',
};

// --- Entidade de aplicação ---------------------------------------------------
//
// Espelha o modelo Prisma `ConviteAcesso`, mas com datas como ISO string
// (fronteira serializável cliente/servidor). O `tokenHash` e o token em claro
// NUNCA são expostos ao cliente.

export interface ConviteAcesso {
  id: string;
  unidadeId?: string;
  unidadeRotulo: string;
  nome: string;
  email: string;
  telefone?: string;
  vinculo: VinculoMorador;
  status: StatusConvite;
  /** ISO. */
  expiresAt: string;
  usuarioId?: string;
  usadoEm?: string;
  revogadoEm?: string;
  revogadoPor?: string;
  criadoPor: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface MoradorInput {
  nome: string;
  email: string;
  telefone?: string;
  vinculo: VinculoMorador;
}

// --- Validade do convite -----------------------------------------------------

/** Janela de validade do link de ativação, em horas. */
export const CONVITE_VALIDADE_HORAS = 72;

/** Data de expiração a partir de "agora" (default: instante atual). */
export function calcularExpiracao(now: number = Date.now()): Date {
  return new Date(now + CONVITE_VALIDADE_HORAS * 60 * 60 * 1000);
}

// --- Validação de entrada (pura) ---------------------------------------------

// Regex conservadora de e-mail: um "@", ao menos um ponto no domínio, sem
// espaços. Suficiente para bloquear entradas obviamente inválidas; a validação
// definitiva é a entrega (aqui simulada) + a ativação pelo próprio morador.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailValido(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Valida os dados do morador para geração do convite. Msg de erro ou null. */
export function validarMorador(input: Partial<MoradorInput>): string | null {
  const nome = (input.nome ?? '').trim();
  if (nome.length < 3) return 'Informe o nome completo do morador.';
  if (!input.email || !isEmailValido(input.email)) return 'Informe um e-mail válido.';
  if (!input.vinculo || !VINCULOS.includes(input.vinculo)) return 'Selecione o vínculo do morador.';
  return null;
}

// --- Derivação de status -----------------------------------------------------

/** Um convite PENDENTE cujo prazo já passou está expirado. */
export function conviteExpirado(
  convite: Pick<ConviteAcesso, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): boolean {
  return convite.status === 'PENDENTE' && new Date(convite.expiresAt).getTime() < now;
}

/** Status apresentado ao Síndico (PENDENTE derivado para EXPIRADO quando vencido). */
export function statusConviteView(
  convite: Pick<ConviteAcesso, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): StatusConviteView {
  if (conviteExpirado(convite, now)) return 'EXPIRADO';
  return convite.status;
}

// --- Regras de transição (o que o Síndico pode fazer) ------------------------

/** Reenviar só faz sentido se o acesso ainda não foi ativado nem revogado. */
export function podeReenviar(view: StatusConviteView): boolean {
  return view === 'PENDENTE' || view === 'EXPIRADO';
}

/** Revogar bloqueia o acesso; não se revoga o que já está revogado. */
export function podeRevogar(view: StatusConviteView): boolean {
  return view !== 'REVOGADO';
}

// --- Validação da ativação (pura) --------------------------------------------
//
// Dado o convite localizado pelo token e o instante atual, decide se a ativação
// pode prosseguir. Uso único: um convite ATIVADO não pode ser reutilizado.

export type MotivoAtivacaoInvalida = 'ja_ativado' | 'revogado' | 'expirado';

export type ResultadoAtivacao =
  | { ok: true }
  | { ok: false; motivo: MotivoAtivacaoInvalida };

export function validarAtivacao(
  convite: Pick<ConviteAcesso, 'status' | 'expiresAt'>,
  now: number = Date.now(),
): ResultadoAtivacao {
  if (convite.status === 'REVOGADO') return { ok: false, motivo: 'revogado' };
  if (convite.status === 'ATIVADO') return { ok: false, motivo: 'ja_ativado' };
  if (conviteExpirado(convite, now)) return { ok: false, motivo: 'expirado' };
  return { ok: true };
}

export const MOTIVO_ATIVACAO_MENSAGEM: Record<MotivoAtivacaoInvalida, string> = {
  ja_ativado: 'Este convite já foi utilizado. Se precisar de um novo acesso, fale com o síndico.',
  revogado: 'Este convite foi revogado. Fale com o síndico para gerar um novo acesso.',
  expirado: 'Este convite expirou. Peça ao síndico para reenviar o convite.',
};

// --- Validação da senha na ativação ------------------------------------------
//
// Reusa a regra mínima já existente no projeto (MIN_PASSWORD_LENGTH). A senha é
// definida exclusivamente pelo morador; o Síndico nunca a vê nem a define.

export function validarSenhaAtivacao(senha: string, confirmacao: string): string | null {
  if (senha.length < MIN_PASSWORD_LENGTH) {
    return `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (senha !== confirmacao) return 'As senhas não coincidem.';
  return null;
}
