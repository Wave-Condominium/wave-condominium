import { describe, it, expect } from 'vitest';

import { construirHistorico } from './transacoes';
import { PAID_STATUS } from '../boletos/boletoStatus';
import type { Boleto } from '../../hooks/useFinancialSummary';
import type { Despesa } from './despesas';

function boleto(overrides: Partial<Boleto> = {}): Boleto {
  return {
    id: 'B1',
    unitNumber: '203',
    unitOwner: 'Fulano',
    referenceMonth: '2026-08',
    dueDate: '2026-08-10',
    amount: 500,
    barcode: 'x',
    status: PAID_STATUS,
    issuedAt: '2026-08-01T00:00:00.000Z',
    issuedBy: 'Síndico',
    description: 'Taxa condominial - Agosto',
    details: { condominiumFee: 500, waterFee: 0, reserveFund: 0, otherFees: 0 },
    ...overrides,
  };
}

function despesa(overrides: Partial<Despesa> = {}): Despesa {
  return {
    id: 'D1',
    categoria: 'LIMPEZA',
    descricao: 'Limpeza',
    valor: 200,
    dataVencimento: '2026-08-05',
    dataPagamento: '2026-08-05',
    formaPagamento: 'PIX',
    origemRecurso: 'SALDO',
    status: 'PAGO',
    registradoPor: 'Síndico',
    criadoEm: '2026-08-05T00:00:00.000Z',
    atualizadoEm: '2026-08-05T00:00:00.000Z',
    ...overrides,
  };
}

describe('construirHistorico', () => {
  it('inclui receitas (boletos pagos) e despesas, com o tipo correto', () => {
    const hist = construirHistorico([boleto({ id: 'B1' })], [despesa({ id: 'D1' })]);
    expect(hist).toHaveLength(2);
    const receita = hist.find((t) => t.id === 'receita:B1');
    const desp = hist.find((t) => t.id === 'despesa:D1');
    expect(receita?.tipo).toBe('receita');
    expect(desp?.tipo).toBe('despesa');
  });

  it('NÃO inclui boletos não pagos (pending/overdue)', () => {
    const hist = construirHistorico(
      [boleto({ id: 'PAGO', status: PAID_STATUS }), boleto({ id: 'PEND', status: 'pending' })],
      [],
    );
    expect(hist.map((t) => t.id)).toEqual(['receita:PAGO']);
  });

  it('NÃO inclui despesas não pagas (pendentes/vencidas)', () => {
    const hist = construirHistorico(
      [],
      [
        despesa({ id: 'PAGA', status: 'PAGO', dataPagamento: '2026-08-10' }),
        despesa({ id: 'PEND', status: 'PENDENTE', dataPagamento: undefined }),
      ],
    );
    expect(hist.map((t) => t.id)).toEqual(['despesa:PAGA']);
  });

  it('usa a categoria em rótulo pt-BR e a data de pagamento como movimentação', () => {
    const [t] = construirHistorico([], [despesa({ id: 'D', categoria: 'ENERGIA', dataPagamento: '2026-08-15' })]);
    expect(t.categoria).toBe('Energia elétrica');
    expect(t.data).toBe('2026-08-15');
  });

  it('ordena da movimentação mais recente para a mais antiga', () => {
    const hist = construirHistorico(
      [boleto({ id: 'B_ANTIGO', paidAt: '2026-08-02T00:00:00.000Z' })],
      [
        despesa({ id: 'D_NOVA', dataPagamento: '2026-08-20' }),
        despesa({ id: 'D_MEIO', dataPagamento: '2026-08-10' }),
      ],
    );
    expect(hist.map((t) => t.id)).toEqual(['despesa:D_NOVA', 'despesa:D_MEIO', 'receita:B_ANTIGO']);
  });

  it('usa a data de compensação/pagamento do boleto quando disponível', () => {
    const hist = construirHistorico(
      [boleto({ id: 'B', issuedAt: '2026-08-01T00:00:00.000Z', paidAt: '2026-08-09T12:00:00.000Z' })],
      [],
    );
    expect(hist[0].data).toBe('2026-08-09');
  });

  it('não muta os arrays de entrada', () => {
    const boletos = [boleto()];
    const despesas = [despesa()];
    const sb = [...boletos];
    const sd = [...despesas];
    construirHistorico(boletos, despesas);
    expect(boletos).toEqual(sb);
    expect(despesas).toEqual(sd);
  });
});
