import { describe, it, expect } from 'vitest';

import {
  resolverCondominioAtivo,
  papelNoCondominio,
  podeAcessarCondominio,
  temMultiplosCondominios,
  papeisNoCondominio,
  type CondominioMembership,
} from './memberships';

const A: CondominioMembership = { condominiumId: 'a', condominiumName: 'Aurora', role: 'Síndico' };
const B: CondominioMembership = { condominiumId: 'b', condominiumName: 'Bosque', role: 'Conselho' };

describe('resolverCondominioAtivo', () => {
  it('prefere o condomínio "home" quando é um dos vínculos', () => {
    expect(resolverCondominioAtivo([A, B], 'b')).toBe('b');
  });
  it('cai no primeiro vínculo quando o preferido não está entre eles', () => {
    expect(resolverCondominioAtivo([A, B], 'z')).toBe('a');
  });
  it('usa o preferido quando não há vínculos (fallback)', () => {
    expect(resolverCondominioAtivo([], 'home')).toBe('home');
  });
  it('null quando não há vínculos nem preferido (ex.: Administradora)', () => {
    expect(resolverCondominioAtivo([], null)).toBeNull();
  });
});

describe('papelNoCondominio', () => {
  it('devolve o papel do vínculo correspondente', () => {
    expect(papelNoCondominio([A, B], 'b')).toBe('Conselho');
  });
  it('null quando não há vínculo ou condomínio', () => {
    expect(papelNoCondominio([A, B], 'z')).toBeNull();
    expect(papelNoCondominio([A, B], null)).toBeNull();
  });
});

describe('podeAcessarCondominio', () => {
  it('true só quando há vínculo (autoridade de acesso)', () => {
    expect(podeAcessarCondominio([A, B], 'a')).toBe(true);
    expect(podeAcessarCondominio([A, B], 'z')).toBe(false);
    expect(podeAcessarCondominio([], 'a')).toBe(false);
  });
});

describe('temMultiplosCondominios', () => {
  it('true a partir de dois vínculos', () => {
    expect(temMultiplosCondominios([A])).toBe(false);
    expect(temMultiplosCondominios([A, B])).toBe(true);
  });
});

describe('papeisNoCondominio', () => {
  it('usa o papel do vínculo como primário', () => {
    expect(papeisNoCondominio('Conselho', 'Morador', null, false)).toEqual(['Conselho']);
  });
  it('cai no fallback quando não há papel de vínculo', () => {
    expect(papeisNoCondominio(null, 'Síndico', null, false)).toEqual(['Síndico']);
  });
  it('inclui o secundário (SÍN-003) só quando é o condomínio home', () => {
    expect(papeisNoCondominio('Síndico', 'Síndico', 'Morador', true)).toEqual(['Síndico', 'Morador']);
    expect(papeisNoCondominio('Síndico', 'Síndico', 'Morador', false)).toEqual(['Síndico']);
  });
});
