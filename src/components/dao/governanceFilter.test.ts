import { describe, it, expect } from 'vitest';

import { parseFiltroParam } from './governanceFilter';

describe('parseFiltroParam', () => {
  it('mapeia o valor canônico "aberta" para votações em andamento', () => {
    expect(parseFiltroParam('aberta')).toBe('aberta');
  });

  it('aceita apelidos de "em andamento" (incl. o histórico "ativas")', () => {
    expect(parseFiltroParam('ativas')).toBe('aberta');
    expect(parseFiltroParam('ativa')).toBe('aberta');
    expect(parseFiltroParam('abertas')).toBe('aberta');
    expect(parseFiltroParam('em_votacao')).toBe('aberta');
  });

  it('normaliza caixa e espaços', () => {
    expect(parseFiltroParam('  ABERTA ')).toBe('aberta');
    expect(parseFiltroParam('Ativas')).toBe('aberta');
  });

  it('mapeia os demais filtros conhecidos', () => {
    expect(parseFiltroParam('aprovadas')).toBe('aprovadas');
    expect(parseFiltroParam('rejeitadas')).toBe('rejeitadas');
    expect(parseFiltroParam('todas')).toBe('todas');
  });

  it('retorna null para ausente/desconhecido', () => {
    expect(parseFiltroParam(null)).toBeNull();
    expect(parseFiltroParam(undefined)).toBeNull();
    expect(parseFiltroParam('')).toBeNull();
    expect(parseFiltroParam('xpto')).toBeNull();
  });
});
