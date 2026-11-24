import { describe, it, expect } from 'vitest';

import {
  normalizarHeader,
  mapearTipo,
  mapearStatus,
  parseNumeroOpcional,
  processarLinhas,
} from './importUnidades';
import { chaveUnidade } from './unidades';

describe('normalizarHeader', () => {
  it('remove acento/caixa e normaliza e-mail', () => {
    expect(normalizarHeader('Número')).toBe('numero');
    expect(normalizarHeader('E-mail do Proprietário')).toBe('email do proprietario');
    expect(normalizarHeader('  Área  Privativa ')).toBe('area privativa');
  });
});

describe('mapearTipo / mapearStatus', () => {
  it('aceita rótulos e chaves', () => {
    expect(mapearTipo('Apartamento')).toBe('APARTAMENTO');
    expect(mapearTipo('vaga autônoma')).toBe('VAGA_AUTONOMA');
    expect(mapearTipo('LOJA')).toBe('LOJA');
    expect(mapearTipo('xyz')).toBeNull();
    expect(mapearStatus('Ocupada')).toBe('OCUPADA');
    expect(mapearStatus('em obra')).toBe('EM_OBRA');
    expect(mapearStatus('vago')).toBe('VAGA');
    expect(mapearStatus('???')).toBeNull();
  });
});

describe('parseNumeroOpcional', () => {
  it('aceita vírgula e vazio; rejeita texto', () => {
    expect(parseNumeroOpcional('0,0125')).toEqual({ ok: true, value: 0.0125 });
    expect(parseNumeroOpcional('85')).toEqual({ ok: true, value: 85 });
    expect(parseNumeroOpcional('')).toEqual({ ok: true, value: undefined });
    expect(parseNumeroOpcional('abc')).toEqual({ ok: false });
  });
});

describe('processarLinhas', () => {
  it('aceita linha válida com cabeçalhos em pt-BR/acentos', () => {
    const rows = [{ 'Bloco': 'A', 'Andar': '3', 'Número': '302', 'Tipo': 'Apartamento', 'Área privativa': '92', 'Vagas': '1', 'Status': 'Ocupada', 'Proprietário': 'João' }];
    const r = processarLinhas(rows, new Set());
    expect(r.erros).toHaveLength(0);
    expect(r.duplicadas).toHaveLength(0);
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].input).toMatchObject({ bloco: 'A', numero: '302', tipo: 'APARTAMENTO', status: 'OCUPADA', areaPrivativa: 92, vagas: 1, proprietarioNome: 'João' });
    expect(r.validos[0].linha).toBe(2);
  });

  it('erro quando falta o número (com linha e tipo de validação)', () => {
    const r = processarLinhas([{ Bloco: 'A', Tipo: 'Sala' }], new Set());
    expect(r.validos).toHaveLength(0);
    expect(r.erros[0]).toMatchObject({ linha: 2, tipoValidacao: 'Campo obrigatório' });
    expect(r.erros[0].motivo).toMatch(/número/i);
  });

  it('erro para tipo e status inválidos', () => {
    const r = processarLinhas([
      { 'Número': '1', 'Tipo': 'Barraco' },
      { 'Número': '2', 'Status': 'Sei lá' },
    ], new Set());
    expect(r.erros).toHaveLength(2);
    expect(r.erros[0].motivo).toMatch(/tipo inválido/i);
    expect(r.erros[1].motivo).toMatch(/status inválido/i);
  });

  it('erro para número não-numérico em área/fração/vagas', () => {
    const r = processarLinhas([{ 'Número': '10', 'Área privativa': 'oitenta' }], new Set());
    expect(r.erros[0].motivo).toMatch(/área privativa inválida/i);
  });

  it('aplica padrões: tipo=Apartamento e status=Vaga quando vazios', () => {
    const r = processarLinhas([{ 'Número': '77' }], new Set());
    expect(r.validos[0].input.tipo).toBe('APARTAMENTO');
    expect(r.validos[0].input.status).toBe('VAGA');
  });

  it('detecta duplicidade contra o banco e dentro do arquivo', () => {
    const existentes = new Set([chaveUnidade({ bloco: 'A', numero: '101' })]);
    const rows = [
      { Bloco: 'A', 'Número': '101', Tipo: 'Apartamento' }, // já existe no banco
      { Bloco: 'B', 'Número': '202', Tipo: 'Apartamento' }, // novo
      { Bloco: 'B', 'Número': '202', Tipo: 'Apartamento' }, // repetido no arquivo
    ];
    const r = processarLinhas(rows, existentes);
    expect(r.validos).toHaveLength(1);
    expect(r.validos[0].input.numero).toBe('202');
    expect(r.duplicadas).toHaveLength(2);
    expect(r.duplicadas.every(d => d.tipoValidacao === 'Duplicidade')).toBe(true);
    expect(r.duplicadas.map(d => d.linha).sort()).toEqual([2, 4]);
  });
});
