import { describe, it, expect } from 'vitest';

import {
  jaConfirmou,
  adicionarConfirmacao,
  confirmacoesDaReuniao,
  totalConfirmados,
  type ConfirmacaoPresenca,
} from './presencaConfirmacoes';

function c(overrides: Partial<ConfirmacaoPresenca> = {}): ConfirmacaoPresenca {
  return { meetingId: 'M1', nome: 'Ana', unidade: '203', confirmadoEm: '2026-08-01T10:00:00.000Z', ...overrides };
}

describe('adicionarConfirmacao / jaConfirmou', () => {
  it('adiciona uma confirmação nova', () => {
    const out = adicionarConfirmacao([], c());
    expect(out).toHaveLength(1);
    expect(jaConfirmou(out, 'M1', '203', 'Ana')).toBe(true);
  });

  it('não duplica a mesma unidade na mesma reunião (incl. variações de grafia)', () => {
    let lista = adicionarConfirmacao([], c({ unidade: '203' }));
    lista = adicionarConfirmacao(lista, c({ unidade: 'Apto 203', nome: 'Ana Maria' }));
    expect(lista).toHaveLength(1);
  });

  it('permite a mesma unidade em reuniões diferentes', () => {
    let lista = adicionarConfirmacao([], c({ meetingId: 'M1' }));
    lista = adicionarConfirmacao(lista, c({ meetingId: 'M2' }));
    expect(lista).toHaveLength(2);
  });

  it('sem unidade, deduplica pelo nome', () => {
    let lista = adicionarConfirmacao([], c({ unidade: '', nome: 'Porteiro João' }));
    lista = adicionarConfirmacao(lista, c({ unidade: '', nome: 'porteiro joão' }));
    expect(lista).toHaveLength(1);
  });

  it('jaConfirmou é false para quem não confirmou', () => {
    const lista = [c({ unidade: '203' })];
    expect(jaConfirmou(lista, 'M1', '504', 'Bruno')).toBe(false);
  });

  it('não muta a entrada', () => {
    const lista = [c()];
    const snap = [...lista];
    adicionarConfirmacao(lista, c({ unidade: '504' }));
    expect(lista).toEqual(snap);
  });
});

describe('confirmacoesDaReuniao / totalConfirmados', () => {
  it('filtra e conta por reunião', () => {
    const lista = [
      c({ meetingId: 'M1', unidade: '203' }),
      c({ meetingId: 'M1', unidade: '504' }),
      c({ meetingId: 'M2', unidade: '203' }),
    ];
    expect(totalConfirmados(lista, 'M1')).toBe(2);
    expect(confirmacoesDaReuniao(lista, 'M2').map((x) => x.unidade)).toEqual(['203']);
  });
});
