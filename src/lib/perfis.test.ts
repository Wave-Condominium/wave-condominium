import { describe, it, expect } from 'vitest';

import { papeisDisponiveis, podeAssumir, temMultiplosPerfis } from './perfis';

describe('papeisDisponiveis', () => {
  it('retorna só o primário quando não há secundário', () => {
    expect(papeisDisponiveis('Síndico')).toEqual(['Síndico']);
    expect(papeisDisponiveis('Morador', null)).toEqual(['Morador']);
  });

  it('inclui o secundário (primário primeiro)', () => {
    expect(papeisDisponiveis('Síndico', 'Morador')).toEqual(['Síndico', 'Morador']);
  });

  it('não duplica quando primário e secundário são iguais', () => {
    expect(papeisDisponiveis('Morador', 'Morador')).toEqual(['Morador']);
  });
});

describe('podeAssumir', () => {
  it('permite o primário e o secundário', () => {
    expect(podeAssumir('Síndico', 'Morador', 'Síndico')).toBe(true);
    expect(podeAssumir('Síndico', 'Morador', 'Morador')).toBe(true);
  });

  it('bloqueia um perfil que o usuário não possui', () => {
    expect(podeAssumir('Síndico', 'Morador', 'Admin')).toBe(false);
    expect(podeAssumir('Morador', null, 'Síndico')).toBe(false);
  });
});

describe('temMultiplosPerfis', () => {
  it('true só quando há dois perfis distintos', () => {
    expect(temMultiplosPerfis('Síndico', 'Morador')).toBe(true);
    expect(temMultiplosPerfis('Síndico')).toBe(false);
    expect(temMultiplosPerfis('Morador', 'Morador')).toBe(false);
  });
});
