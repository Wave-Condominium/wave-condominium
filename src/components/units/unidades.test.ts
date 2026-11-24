import { describe, it, expect } from 'vitest';

import {
  TIPOS_UNIDADE,
  TIPO_UNIDADE_LABEL,
  STATUS_UNIDADE,
  validarUnidade,
  chaveUnidade,
  rotuloUnidade,
  formatArea,
  formatFracao,
  diffUnidade,
  type Unidade,
  type UnidadeInput,
} from './unidades';

function input(overrides: Partial<UnidadeInput> = {}): UnidadeInput {
  return { numero: '302', tipo: 'APARTAMENTO', status: 'VAGA', ...overrides };
}

function unidade(overrides: Partial<Unidade> = {}): Unidade {
  return {
    id: 'U1',
    bloco: '',
    andar: '3',
    numero: '302',
    tipo: 'APARTAMENTO',
    vagas: 1,
    status: 'VAGA',
    criadoEm: '2026-08-01T00:00:00.000Z',
    atualizadoEm: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('catálogos', () => {
  it('tem os 5 tipos e 3 status do card', () => {
    expect(TIPOS_UNIDADE).toEqual(['APARTAMENTO', 'SALA', 'LOJA', 'COBERTURA', 'VAGA_AUTONOMA']);
    expect(TIPO_UNIDADE_LABEL.VAGA_AUTONOMA).toBe('Vaga autônoma');
    expect(STATUS_UNIDADE).toEqual(['OCUPADA', 'VAGA', 'EM_OBRA']);
  });
});

describe('validarUnidade', () => {
  it('aceita entrada válida', () => {
    expect(validarUnidade(input())).toBeNull();
  });
  it('exige número', () => {
    expect(validarUnidade(input({ numero: '  ' }))).toMatch(/número/i);
  });
  it('exige tipo e status', () => {
    expect(validarUnidade(input({ tipo: undefined as never }))).toMatch(/tipo/i);
    expect(validarUnidade(input({ status: undefined as never }))).toMatch(/status/i);
  });
  it('rejeita vagas/área/fração negativas', () => {
    expect(validarUnidade(input({ vagas: -1 }))).toMatch(/vagas/i);
    expect(validarUnidade(input({ areaPrivativa: -5 }))).toMatch(/área/i);
    expect(validarUnidade(input({ fracaoIdeal: -0.1 }))).toMatch(/fração/i);
  });
});

describe('chaveUnidade (deduplicação)', () => {
  it('normaliza bloco+número e ignora caixa/espacos', () => {
    expect(chaveUnidade({ bloco: 'B', numero: '302' })).toBe(chaveUnidade({ bloco: ' b ', numero: '302' }));
  });
  it('trata sem bloco', () => {
    expect(chaveUnidade({ numero: '10' })).toBe('|10');
  });
});

describe('rotuloUnidade', () => {
  it('inclui o bloco quando houver', () => {
    expect(rotuloUnidade({ bloco: 'B', numero: '302' })).toBe('B · 302');
    expect(rotuloUnidade({ bloco: '', numero: '302' })).toBe('302');
  });
});

describe('formatação', () => {
  it('formata área e fração; ausência vira —', () => {
    expect(formatArea(85)).toBe('85,00 m²');
    expect(formatArea(undefined)).toBe('—');
    expect(formatFracao(0.0125)).toBe('0,0125');
    expect(formatFracao(undefined)).toBe('—');
  });
});

describe('diffUnidade (auditoria)', () => {
  it('detecta campos alterados com rótulo e de/para legíveis', () => {
    const antes = unidade({ status: 'VAGA', proprietarioNome: undefined });
    const depois = unidade({ status: 'OCUPADA', proprietarioNome: 'João Silva' });
    const alt = diffUnidade(antes, depois);
    const status = alt.find((a) => a.campo === 'Status');
    const prop = alt.find((a) => a.campo === 'Proprietário');
    expect(status).toEqual({ campo: 'Status', de: 'Vaga', para: 'Ocupada' });
    expect(prop).toEqual({ campo: 'Proprietário', de: '—', para: 'João Silva' });
  });
  it('retorna vazio quando nada muda e não muta as entradas', () => {
    const a = unidade();
    const b = unidade();
    const snap = JSON.stringify(a);
    expect(diffUnidade(a, b)).toEqual([]);
    expect(JSON.stringify(a)).toBe(snap);
  });
  it('usa rótulos pt-BR para tipo e área', () => {
    const alt = diffUnidade(unidade({ tipo: 'APARTAMENTO', areaPrivativa: 80 }), unidade({ tipo: 'LOJA', areaPrivativa: 120 }));
    expect(alt.find((a) => a.campo === 'Tipo')).toEqual({ campo: 'Tipo', de: 'Apartamento', para: 'Loja' });
    expect(alt.find((a) => a.campo === 'Área privativa')).toEqual({ campo: 'Área privativa', de: '80,00 m²', para: '120,00 m²' });
  });
});
