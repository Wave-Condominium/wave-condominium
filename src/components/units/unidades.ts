// ---------------------------------------------------------------------------
// src/components/units/unidades.ts
//
// Modelo de domínio e lógica PURA das Unidades (SÍN-021). Sem React/DOM nem
// imports de servidor — testável no Vitest. As chaves de tipo/status espelham
// os enums do Prisma; as Server Actions mapeiam de/para estes tipos-string.
// ---------------------------------------------------------------------------

// --- Tipo da unidade ---------------------------------------------------------

export type TipoUnidade = 'APARTAMENTO' | 'SALA' | 'LOJA' | 'COBERTURA' | 'VAGA_AUTONOMA';

export const TIPO_UNIDADE_LABEL: Record<TipoUnidade, string> = {
  APARTAMENTO: 'Apartamento',
  SALA: 'Sala',
  LOJA: 'Loja',
  COBERTURA: 'Cobertura',
  VAGA_AUTONOMA: 'Vaga autônoma',
};

export const TIPOS_UNIDADE: TipoUnidade[] = [
  'APARTAMENTO',
  'SALA',
  'LOJA',
  'COBERTURA',
  'VAGA_AUTONOMA',
];

// --- Status de ocupação ------------------------------------------------------

export type StatusUnidade = 'OCUPADA' | 'VAGA' | 'EM_OBRA';

export const STATUS_UNIDADE_LABEL: Record<StatusUnidade, string> = {
  OCUPADA: 'Ocupada',
  VAGA: 'Vaga',
  EM_OBRA: 'Em obra',
};

/** Classes de badge por status (consistente com o design system). */
export const STATUS_UNIDADE_COR: Record<StatusUnidade, string> = {
  OCUPADA: 'bg-brand-teal/15 text-brand-teal',
  VAGA: 'bg-gray-100 text-gray-600',
  EM_OBRA: 'bg-amber-100 text-amber-700',
};

export const STATUS_UNIDADE: StatusUnidade[] = ['OCUPADA', 'VAGA', 'EM_OBRA'];

// --- Entidade de aplicação ---------------------------------------------------

export interface Unidade {
  id: string;
  /** Bloco/torre ("" = sem bloco). */
  bloco: string;
  /** Andar (texto livre: "Térreo", "1"...). */
  andar: string;
  numero: string;
  tipo: TipoUnidade;
  fracaoIdeal?: number;
  areaPrivativa?: number;
  vagas: number;
  status: StatusUnidade;
  proprietarioNome?: string;
  proprietarioEmail?: string;
  proprietarioTelefone?: string;
  inquilinoNome?: string;
  inquilinoEmail?: string;
  inquilinoTelefone?: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface UnidadeInput {
  bloco?: string;
  andar?: string;
  numero: string;
  tipo: TipoUnidade;
  fracaoIdeal?: number;
  areaPrivativa?: number;
  vagas?: number;
  status: StatusUnidade;
  proprietarioNome?: string;
  proprietarioEmail?: string;
  proprietarioTelefone?: string;
  inquilinoNome?: string;
  inquilinoEmail?: string;
  inquilinoTelefone?: string;
}

// --- Identidade / dedução ----------------------------------------------------

/** Chave de identidade de uma unidade (para deduplicação): bloco + número. */
export function chaveUnidade(u: { bloco?: string | null; numero: string }): string {
  return `${(u.bloco ?? '').trim().toLowerCase()}|${u.numero.trim().toLowerCase()}`;
}

/** Rótulo curto da unidade (ex.: "Bloco B · 302" ou "302"). */
export function rotuloUnidade(u: { bloco?: string | null; numero: string }): string {
  const bloco = (u.bloco ?? '').trim();
  return bloco ? `${bloco} · ${u.numero}` : u.numero;
}

// --- Validação (pura) --------------------------------------------------------

/** Valida os campos obrigatórios/consistência. Retorna a mensagem de erro ou null. */
export function validarUnidade(input: Partial<UnidadeInput>): string | null {
  if (!input.numero || !input.numero.trim()) return 'Informe o número da unidade.';
  if (!input.tipo) return 'Selecione o tipo da unidade.';
  if (!input.status) return 'Selecione o status da unidade.';
  if (input.vagas != null && (Number.isNaN(input.vagas) || input.vagas < 0)) {
    return 'A quantidade de vagas não pode ser negativa.';
  }
  if (input.areaPrivativa != null && (Number.isNaN(input.areaPrivativa) || input.areaPrivativa < 0)) {
    return 'A área privativa não pode ser negativa.';
  }
  if (input.fracaoIdeal != null && (Number.isNaN(input.fracaoIdeal) || input.fracaoIdeal < 0)) {
    return 'A fração ideal não pode ser negativa.';
  }
  return null;
}

// --- Formatação --------------------------------------------------------------

export function formatArea(area?: number): string {
  if (area == null || Number.isNaN(area)) return '—';
  return `${area.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

export function formatFracao(fracao?: number): string {
  if (fracao == null || Number.isNaN(fracao)) return '—';
  return fracao.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
}

// --- Auditoria: diff antes/depois -------------------------------------------
// Alimenta a trilha de Auditoria com "informação alterada, valor anterior e
// novo valor". Compara apenas os campos cadastrais relevantes, já com rótulos
// pt-BR e valores em texto.

export interface AlteracaoCampo {
  campo: string;
  de: string;
  para: string;
}

const CAMPO_LABEL: Record<string, string> = {
  bloco: 'Bloco/Torre',
  andar: 'Andar',
  numero: 'Número',
  tipo: 'Tipo',
  fracaoIdeal: 'Fração ideal',
  areaPrivativa: 'Área privativa',
  vagas: 'Vagas',
  status: 'Status',
  proprietarioNome: 'Proprietário',
  proprietarioEmail: 'E-mail do proprietário',
  proprietarioTelefone: 'Telefone do proprietário',
  inquilinoNome: 'Inquilino',
  inquilinoEmail: 'E-mail do inquilino',
  inquilinoTelefone: 'Telefone do inquilino',
};

function valorTexto(campo: string, valor: unknown): string {
  if (valor == null || valor === '') return '—';
  if (campo === 'tipo') return TIPO_UNIDADE_LABEL[valor as TipoUnidade] ?? String(valor);
  if (campo === 'status') return STATUS_UNIDADE_LABEL[valor as StatusUnidade] ?? String(valor);
  if (campo === 'areaPrivativa') return formatArea(valor as number);
  if (campo === 'fracaoIdeal') return formatFracao(valor as number);
  return String(valor);
}

/**
 * Compara duas unidades e retorna os campos alterados (rótulo + de/para).
 * Não muta as entradas.
 */
export function diffUnidade(antes: Unidade, depois: Unidade): AlteracaoCampo[] {
  const campos = Object.keys(CAMPO_LABEL) as (keyof Unidade)[];
  const alteracoes: AlteracaoCampo[] = [];
  for (const campo of campos) {
    const a = antes[campo] ?? '';
    const b = depois[campo] ?? '';
    if (String(a) !== String(b)) {
      alteracoes.push({
        campo: CAMPO_LABEL[campo],
        de: valorTexto(campo, antes[campo]),
        para: valorTexto(campo, depois[campo]),
      });
    }
  }
  return alteracoes;
}
