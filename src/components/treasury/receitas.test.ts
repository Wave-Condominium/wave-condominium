import { describe, it, expect } from 'vitest';

import {
  reconciliar,
  agruparPorMes,
  totalContabilizado,
  normalizarUnidade,
  formatMesReferencia,
  STATUS_CONTABILIZACAO_LABEL,
  type Receita,
} from './receitas';

function receita(over: Partial<Receita> = {}): Receita {
  return {
    id: 'r1', unitNumber: '203', unitOwner: 'Maria', referenceMonth: '2026-08',
    valor: 850, dataPagamento: '2026-08-05T12:00:00.000Z', status: 'CONTABILIZADA',
    origem: 'PSP_WEBHOOK', ...over,
  };
}

describe('normalizarUnidade', () => {
  it('casa "Apto 203" com "203"', () => {
    expect(normalizarUnidade('Apto 203')).toBe('203');
    expect(normalizarUnidade('203')).toBe('203');
    expect(normalizarUnidade(null)).toBe('');
  });
});

describe('reconciliar (PAG-009)', () => {
  it('igual ao boleto → contabilizada', () => {
    expect(reconciliar(850, 850).status).toBe('CONTABILIZADA');
  });
  it('sem boleto → pendente de conciliação', () => {
    const r = reconciliar(850, null);
    expect(r.status).toBe('PENDENTE_CONCILIACAO');
    expect(r.motivo).toMatch(/sem boleto/i);
  });
  it('valor diferente → divergente com motivo', () => {
    const r = reconciliar(800, 850);
    expect(r.status).toBe('DIVERGENTE');
    expect(r.motivo).toMatch(/diferente/i);
  });
  it('tolera diferença de arredondamento', () => {
    expect(reconciliar(850.004, 850).status).toBe('CONTABILIZADA');
  });
});

describe('agruparPorMes', () => {
  it('consolida por mês, mais recente primeiro', () => {
    const meses = agruparPorMes([
      receita({ referenceMonth: '2026-07', valor: 800 }),
      receita({ referenceMonth: '2026-08', valor: 850 }),
      receita({ referenceMonth: '2026-08', valor: 120 }),
    ]);
    expect(meses[0].mes).toBe('2026-08');
    expect(meses[0].total).toBe(970);
    expect(meses[0].quantidade).toBe(2);
    expect(meses[1].mes).toBe('2026-07');
  });
});

describe('totalContabilizado', () => {
  it('soma só as contabilizadas', () => {
    const total = totalContabilizado([
      receita({ valor: 850, status: 'CONTABILIZADA' }),
      receita({ valor: 800, status: 'DIVERGENTE' }),
      receita({ valor: 120, status: 'PENDENTE_CONCILIACAO' }),
    ]);
    expect(total).toBe(850);
  });
});

describe('formatMesReferencia', () => {
  it('formata YYYY-MM legível', () => {
    expect(formatMesReferencia('2026-08')).toBe('ago/2026');
  });
});

describe('catálogo', () => {
  it('rotula os status', () => {
    expect(STATUS_CONTABILIZACAO_LABEL.CONTABILIZADA).toMatch(/contabiliz/i);
    expect(STATUS_CONTABILIZACAO_LABEL.DIVERGENTE).toMatch(/diverg/i);
  });
});
