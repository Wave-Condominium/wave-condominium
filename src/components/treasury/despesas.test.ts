import { describe, it, expect } from 'vitest';

import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_LABEL,
  FORMAS_PAGAMENTO,
  validarNovaDespesa,
  validarPagamento,
  statusDeInput,
  statusInicialDespesa,
  requerAprovacao,
  despesaPodePagar,
  isDespesaVencida,
  statusView,
  totalDespesas,
  agruparPorCategoria,
  formatBRL,
  type Despesa,
  type NovaDespesaInput,
} from './despesas';

describe('alçada de aprovação (SÍN-026)', () => {
  it('requerAprovacao só quando há alçada e o valor a ultrapassa', () => {
    expect(requerAprovacao(5000, null)).toBe(false);      // sem alçada
    expect(requerAprovacao(5000, undefined)).toBe(false);
    expect(requerAprovacao(5000, 5000)).toBe(false);      // igual ao teto não exige
    expect(requerAprovacao(5001, 5000)).toBe(true);       // acima exige
    expect(requerAprovacao(100, 5000)).toBe(false);
  });

  it('statusInicialDespesa: pago > aguardando > pendente', () => {
    // já paga (tem dataPagamento) — não passa por aprovação
    expect(statusInicialDespesa({ valor: 9000, dataPagamento: '2026-08-10' }, 5000)).toBe('PAGO');
    // acima da alçada e não paga → aguardando aprovação
    expect(statusInicialDespesa({ valor: 9000 }, 5000)).toBe('AGUARDANDO_APROVACAO');
    // dentro da alçada → pendente
    expect(statusInicialDespesa({ valor: 3000 }, 5000)).toBe('PENDENTE');
    // sem alçada → pendente (comportamento anterior)
    expect(statusInicialDespesa({ valor: 9000 }, null)).toBe('PENDENTE');
  });

  it('despesaPodePagar só para pendente/vencida', () => {
    expect(despesaPodePagar('PENDENTE')).toBe(true);
    expect(despesaPodePagar('VENCIDO')).toBe(true);
    expect(despesaPodePagar('AGUARDANDO_APROVACAO')).toBe(false);
    expect(despesaPodePagar('REPROVADA')).toBe(false);
    expect(despesaPodePagar('PAGO')).toBe(false);
  });
});

function novaDespesa(overrides: Partial<NovaDespesaInput> = {}): NovaDespesaInput {
  return {
    categoria: 'MANUTENCAO_PREDIAL',
    descricao: 'Reparo da bomba',
    valor: 1200,
    dataVencimento: '2026-08-20',
    origemRecurso: 'SALDO',
    ...overrides,
  };
}

function despesa(overrides: Partial<Despesa> = {}): Despesa {
  return {
    id: 'D1',
    categoria: 'ENERGIA',
    descricao: 'Energia — áreas comuns',
    valor: 4200,
    dataVencimento: '2026-08-18',
    origemRecurso: 'SALDO',
    status: 'PENDENTE',
    registradoPor: 'Síndico',
    criadoEm: '2026-08-01T00:00:00.000Z',
    atualizadoEm: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('catálogo de categorias/formas', () => {
  it('expõe as 14 categorias do SÍN-011 com rótulo para cada uma', () => {
    expect(CATEGORIAS_DESPESA).toHaveLength(14);
    for (const c of CATEGORIAS_DESPESA) {
      expect(CATEGORIA_DESPESA_LABEL[c]).toBeTruthy();
    }
  });

  it('inclui as formas de pagamento esperadas', () => {
    expect(FORMAS_PAGAMENTO).toContain('PIX');
    expect(FORMAS_PAGAMENTO).toContain('BOLETO');
  });
});

describe('validarNovaDespesa', () => {
  it('aceita uma entrada válida', () => {
    expect(validarNovaDespesa(novaDespesa())).toBeNull();
  });

  it('exige descrição', () => {
    expect(validarNovaDespesa(novaDespesa({ descricao: '   ' }))).toMatch(/descrição/i);
  });

  it('exige valor maior que zero', () => {
    expect(validarNovaDespesa(novaDespesa({ valor: 0 }))).toMatch(/valor/i);
    expect(validarNovaDespesa(novaDespesa({ valor: -5 }))).toMatch(/valor/i);
    expect(validarNovaDespesa(novaDespesa({ valor: NaN }))).toMatch(/valor/i);
  });

  it('exige categoria e vencimento', () => {
    expect(validarNovaDespesa(novaDespesa({ categoria: undefined as never }))).toMatch(/categoria/i);
    expect(validarNovaDespesa(novaDespesa({ dataVencimento: '' }))).toMatch(/vencimento/i);
  });

  it('exige origem do recurso', () => {
    expect(validarNovaDespesa(novaDespesa({ origemRecurso: undefined as never }))).toMatch(/origem/i);
  });
});

describe('statusDeInput', () => {
  it('nasce PAGO quando há data de pagamento; PENDENTE caso contrário', () => {
    expect(statusDeInput({ dataPagamento: '2026-08-19' })).toBe('PAGO');
    expect(statusDeInput({ dataPagamento: undefined })).toBe('PENDENTE');
  });
});

describe('validarPagamento', () => {
  it('exige a data do pagamento (despesa paga precisa de data)', () => {
    expect(validarPagamento({})).toMatch(/data/i);
    expect(validarPagamento({ dataPagamento: '2026-08-25' })).toBeNull();
  });
});

describe('status derivado (Vencido)', () => {
  const hoje = '2026-08-27';

  it('pendente com vencimento no passado é VENCIDA', () => {
    const d = despesa({ status: 'PENDENTE', dataVencimento: '2026-08-18' });
    expect(isDespesaVencida(d, hoje)).toBe(true);
    expect(statusView(d, hoje)).toBe('VENCIDO');
  });

  it('pendente com vencimento futuro continua PENDENTE', () => {
    const d = despesa({ status: 'PENDENTE', dataVencimento: '2026-09-10' });
    expect(isDespesaVencida(d, hoje)).toBe(false);
    expect(statusView(d, hoje)).toBe('PENDENTE');
  });

  it('paga nunca é considerada vencida', () => {
    const d = despesa({ status: 'PAGO', dataVencimento: '2026-08-01', dataPagamento: '2026-08-05' });
    expect(isDespesaVencida(d, hoje)).toBe(false);
    expect(statusView(d, hoje)).toBe('PAGO');
  });
});

describe('agregações', () => {
  it('soma o total das despesas', () => {
    expect(totalDespesas([despesa({ valor: 100 }), despesa({ valor: 250 })])).toBe(350);
  });

  it('agrupa por categoria com rótulo, %, e ordena do maior para o menor', () => {
    const resumo = agruparPorCategoria([
      despesa({ categoria: 'ENERGIA', valor: 300 }),
      despesa({ categoria: 'LIMPEZA', valor: 700 }),
      despesa({ categoria: 'ENERGIA', valor: 100 }),
    ]);
    expect(resumo[0].categoria).toBe('LIMPEZA');
    expect(resumo[0].valor).toBe(700);
    expect(resumo[0].label).toBe('Limpeza e conservação');
    const energia = resumo.find((r) => r.categoria === 'ENERGIA');
    expect(energia?.valor).toBe(400);
    expect(energia?.percentual).toBe(36); // 400 / 1100 ≈ 36%
  });

  it('não muta a entrada', () => {
    const arr = [despesa()];
    const snap = [...arr];
    agruparPorCategoria(arr);
    expect(arr).toEqual(snap);
  });
});

describe('formatBRL', () => {
  it('formata em Real com duas casas', () => {
    expect(formatBRL(1234.5)).toBe('R$ 1.234,50');
  });
});
