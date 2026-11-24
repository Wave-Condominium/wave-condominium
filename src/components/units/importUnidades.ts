// ---------------------------------------------------------------------------
// src/components/units/importUnidades.ts
//
// Lógica PURA da importação em massa de unidades (SÍN-021, Fase 2). Recebe as
// LINHAS já parseadas (CSV/Excel viram Record<header,valor> no servidor) e as
// chaves das unidades já existentes, e produz: válidos, duplicados e erros —
// com linha, unidade, motivo e tipo de validação. Sem I/O nem parsing de
// arquivo (isso fica na Server Action), então é 100% testável.
// ---------------------------------------------------------------------------

import {
  validarUnidade,
  chaveUnidade,
  type UnidadeInput,
  type TipoUnidade,
  type StatusUnidade,
} from './unidades';

export interface ImportErro {
  /** Linha do arquivo (1 = cabeçalho; dados começam na linha 2). */
  linha: number;
  /** Unidade relacionada, quando identificável (ex.: "B · 302"). */
  unidade: string;
  motivo: string;
  tipoValidacao: string;
}

export interface ImportItemValido {
  linha: number;
  input: UnidadeInput;
}

export interface ImportResultado {
  validos: ImportItemValido[];
  duplicadas: ImportErro[];
  erros: ImportErro[];
}

/** Normaliza um cabeçalho: sem acento, minúsculo, só alfanumérico + espaço. */
export function normalizarHeader(h: string): string {
  return (h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\be mail\b/g, 'email')
    .trim();
}

type Campo =
  | 'bloco' | 'andar' | 'numero' | 'tipo' | 'fracaoIdeal' | 'areaPrivativa'
  | 'vagas' | 'status' | 'proprietarioNome' | 'proprietarioEmail'
  | 'proprietarioTelefone' | 'inquilinoNome' | 'inquilinoEmail' | 'inquilinoTelefone';

const ALIASES: Record<string, Campo> = {
  'bloco': 'bloco', 'bloco torre': 'bloco', 'torre': 'bloco',
  'andar': 'andar',
  'numero': 'numero', 'numero da unidade': 'numero', 'unidade': 'numero', 'n': 'numero',
  'tipo': 'tipo', 'tipo da unidade': 'tipo',
  'fracao ideal': 'fracaoIdeal', 'fracao': 'fracaoIdeal',
  'area privativa': 'areaPrivativa', 'area': 'areaPrivativa', 'area privativa m2': 'areaPrivativa',
  'vagas': 'vagas', 'quantidade de vagas': 'vagas', 'qtd vagas': 'vagas', 'vaga': 'vagas',
  'status': 'status', 'situacao': 'status',
  'proprietario': 'proprietarioNome', 'nome do proprietario': 'proprietarioNome',
  'email do proprietario': 'proprietarioEmail', 'email proprietario': 'proprietarioEmail',
  'telefone do proprietario': 'proprietarioTelefone', 'telefone proprietario': 'proprietarioTelefone', 'fone do proprietario': 'proprietarioTelefone',
  'inquilino': 'inquilinoNome', 'nome do inquilino': 'inquilinoNome',
  'email do inquilino': 'inquilinoEmail', 'email inquilino': 'inquilinoEmail',
  'telefone do inquilino': 'inquilinoTelefone', 'telefone inquilino': 'inquilinoTelefone',
};

const TIPO_MAP: Record<string, TipoUnidade> = {
  apartamento: 'APARTAMENTO', apto: 'APARTAMENTO',
  sala: 'SALA',
  loja: 'LOJA',
  cobertura: 'COBERTURA',
  'vaga autonoma': 'VAGA_AUTONOMA', vaga_autonoma: 'VAGA_AUTONOMA', vaga: 'VAGA_AUTONOMA',
};

const STATUS_MAP: Record<string, StatusUnidade> = {
  ocupada: 'OCUPADA', ocupado: 'OCUPADA',
  vaga: 'VAGA', vago: 'VAGA', livre: 'VAGA',
  'em obra': 'EM_OBRA', em_obra: 'EM_OBRA', obra: 'EM_OBRA', reforma: 'EM_OBRA',
};

function chave(v: string): string {
  return (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function mapearTipo(v: string): TipoUnidade | null {
  return TIPO_MAP[chave(v).replace(/[^a-z_ ]/g, '')] ?? null;
}

export function mapearStatus(v: string): StatusUnidade | null {
  return STATUS_MAP[chave(v).replace(/[^a-z_ ]/g, '')] ?? null;
}

/** Parse de número opcional aceitando vírgula decimal (pt-BR). */
export function parseNumeroOpcional(v: string): { ok: boolean; value?: number } {
  const t = (v ?? '').trim();
  if (!t) return { ok: true, value: undefined };
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  if (Number.isNaN(n)) return { ok: false };
  return { ok: true, value: n };
}

/** Extrai os campos de uma linha, mapeando os cabeçalhos por alias. */
function camposDaLinha(row: Record<string, unknown>): Partial<Record<Campo, string>> {
  const out: Partial<Record<Campo, string>> = {};
  for (const [rawKey, rawVal] of Object.entries(row)) {
    const campo = ALIASES[normalizarHeader(rawKey)];
    if (campo) out[campo] = rawVal == null ? '' : String(rawVal).trim();
  }
  return out;
}

function rotulo(bloco: string, numero: string): string {
  const b = (bloco ?? '').trim();
  return b ? `${b} · ${numero}` : (numero || '—');
}

/**
 * Processa as linhas do arquivo. `existentes` = chaves (chaveUnidade) das
 * unidades já cadastradas — usadas para detectar duplicidade contra o banco.
 * A duplicidade DENTRO do próprio arquivo também é detectada.
 */
export function processarLinhas(
  rows: Record<string, unknown>[],
  existentes: Set<string>,
): ImportResultado {
  const validos: ImportItemValido[] = [];
  const duplicadas: ImportErro[] = [];
  const erros: ImportErro[] = [];
  const vistos = new Set<string>(existentes);

  rows.forEach((row, i) => {
    const linha = i + 2; // linha 1 = cabeçalho
    const c = camposDaLinha(row);
    const bloco = (c.bloco ?? '').trim();
    const numero = (c.numero ?? '').trim();
    const unidade = rotulo(bloco, numero);

    if (!numero) {
      erros.push({ linha, unidade, motivo: 'Número da unidade é obrigatório.', tipoValidacao: 'Campo obrigatório' });
      return;
    }

    // Tipo: vazio → Apartamento (padrão); preenchido inválido → erro.
    let tipo: TipoUnidade = 'APARTAMENTO';
    if ((c.tipo ?? '').trim()) {
      const t = mapearTipo(c.tipo!);
      if (!t) {
        erros.push({ linha, unidade, motivo: `Tipo inválido: "${c.tipo}".`, tipoValidacao: 'Valor inválido' });
        return;
      }
      tipo = t;
    }

    // Status: vazio → Vaga (padrão); preenchido inválido → erro.
    let status: StatusUnidade = 'VAGA';
    if ((c.status ?? '').trim()) {
      const s = mapearStatus(c.status!);
      if (!s) {
        erros.push({ linha, unidade, motivo: `Status inválido: "${c.status}".`, tipoValidacao: 'Valor inválido' });
        return;
      }
      status = s;
    }

    const fracao = parseNumeroOpcional(c.fracaoIdeal ?? '');
    if (!fracao.ok) {
      erros.push({ linha, unidade, motivo: `Fração ideal inválida: "${c.fracaoIdeal}".`, tipoValidacao: 'Valor inválido' });
      return;
    }
    const area = parseNumeroOpcional(c.areaPrivativa ?? '');
    if (!area.ok) {
      erros.push({ linha, unidade, motivo: `Área privativa inválida: "${c.areaPrivativa}".`, tipoValidacao: 'Valor inválido' });
      return;
    }
    const vagas = parseNumeroOpcional(c.vagas ?? '');
    if (!vagas.ok) {
      erros.push({ linha, unidade, motivo: `Vagas inválida: "${c.vagas}".`, tipoValidacao: 'Valor inválido' });
      return;
    }

    const input: UnidadeInput = {
      bloco,
      andar: (c.andar ?? '').trim(),
      numero,
      tipo,
      fracaoIdeal: fracao.value,
      areaPrivativa: area.value,
      vagas: vagas.value != null ? Math.trunc(vagas.value) : 0,
      status,
      proprietarioNome: c.proprietarioNome,
      proprietarioEmail: c.proprietarioEmail,
      proprietarioTelefone: c.proprietarioTelefone,
      inquilinoNome: c.inquilinoNome,
      inquilinoEmail: c.inquilinoEmail,
      inquilinoTelefone: c.inquilinoTelefone,
    };

    const erroValidacao = validarUnidade(input);
    if (erroValidacao) {
      erros.push({ linha, unidade, motivo: erroValidacao, tipoValidacao: 'Regra de negócio' });
      return;
    }

    const key = chaveUnidade({ bloco, numero });
    if (vistos.has(key)) {
      duplicadas.push({ linha, unidade, motivo: 'Unidade duplicada (já existe ou repetida no arquivo).', tipoValidacao: 'Duplicidade' });
      return;
    }
    vistos.add(key);
    validos.push({ linha, input });
  });

  return { validos, duplicadas, erros };
}
