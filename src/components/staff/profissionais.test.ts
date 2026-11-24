import { describe, it, expect } from 'vitest';

import {
  selectProfissionaisVisiveis,
  iniciais,
  type Profissional,
} from './profissionais';

function pro(overrides: Partial<Profissional> = {}): Profissional {
  return {
    id: 'P',
    nome: 'Fulano de Tal',
    funcao: 'Zelador',
    vinculo: 'funcionario',
    ativo: true,
    ...overrides,
  };
}

describe('selectProfissionaisVisiveis', () => {
  it('exibe apenas profissionais ativos (contratados/vinculados)', () => {
    const out = selectProfissionaisVisiveis([
      pro({ id: 'ATIVO', ativo: true }),
      pro({ id: 'INATIVO', ativo: false }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['ATIVO']);
  });

  it('ordena funcionários antes de prestadores e alfabeticamente dentro do grupo', () => {
    const out = selectProfissionaisVisiveis([
      pro({ id: 'P1', nome: 'Zeladoria SA', vinculo: 'prestador' }),
      pro({ id: 'F2', nome: 'Bruno', vinculo: 'funcionario' }),
      pro({ id: 'F1', nome: 'Ana', vinculo: 'funcionario' }),
      pro({ id: 'P0', nome: 'Alfa Servicos', vinculo: 'prestador' }),
    ]);
    expect(out.map((p) => p.id)).toEqual(['F1', 'F2', 'P0', 'P1']);
  });

  it('não muta o array de entrada', () => {
    const lista = [pro({ id: 'B', nome: 'Bruno' }), pro({ id: 'A', nome: 'Ana' })];
    const snapshot = [...lista];
    selectProfissionaisVisiveis(lista);
    expect(lista).toEqual(snapshot);
  });
});

describe('iniciais', () => {
  it('gera as iniciais do primeiro e último nome', () => {
    expect(iniciais('Carlos Andrade')).toBe('CA');
    expect(iniciais('Maria Clara Souza')).toBe('MS');
  });

  it('trata nome único e vazio', () => {
    expect(iniciais('Zelador')).toBe('ZE');
    expect(iniciais('   ')).toBe('?');
  });
});
