import { describe, it, expect } from 'vitest';

import {
  conciliar,
  lancamentosDeBoletos,
  boletoParaLancamento,
  isBoletoLiquidado,
  CATEGORIA_RECEITA_BOLETO,
  type BoletoConciliavel,
  type LancamentoReceita,
} from './conciliacao';

const LIQUIDADO = 'blockchain_registered'; // === PAID_STATUS

function boleto(over: Partial<BoletoConciliavel> = {}): BoletoConciliavel {
  return {
    id: 'b1',
    unitNumber: '203',
    amount: 850,
    status: LIQUIDADO,
    paidAt: '2026-08-10',
    compensatedAt: '2026-08-11',
    issuedAt: '2026-08-01',
    description: 'Taxa condominial',
    ...over,
  };
}

describe('projeção boleto -> lançamento (fonte única)', () => {
  it('usa a data de compensação e referencia o boleto', () => {
    const l = boletoParaLancamento(boleto());
    expect(l).toMatchObject({
      id: 'receita:b1',
      boletoId: 'b1',
      unidade: '203',
      valor: 850,
      data: '2026-08-11',
      categoria: CATEGORIA_RECEITA_BOLETO,
    });
  });

  it('só considera boletos liquidados e não duplica por boleto', () => {
    const lancs = lancamentosDeBoletos([
      boleto({ id: 'b1' }),
      boleto({ id: 'b2', status: 'pending' }),
      boleto({ id: 'b1' }), // repetido -> Map dedup
    ]);
    expect(lancs.map((l) => l.boletoId)).toEqual(['b1']);
  });

  it('isBoletoLiquidado reflete o status de pagamento', () => {
    expect(isBoletoLiquidado(boleto())).toBe(true);
    expect(isBoletoLiquidado(boleto({ status: 'pending' }))).toBe(false);
  });
});

describe('conciliar', () => {
  it('tudo conciliado quando os lançamentos derivam dos boletos', () => {
    const boletos = [boleto({ id: 'b1' }), boleto({ id: 'b2', unitNumber: '101', amount: 920 })];
    const r = conciliar(boletos, lancamentosDeBoletos(boletos));
    expect(r.totalDivergentes).toBe(0);
    expect(r.totalConciliados).toBe(2);
    expect(r.naoConciliados).toHaveLength(0);
  });

  it('detecta boleto liquidado sem lançamento', () => {
    const r = conciliar([boleto({ id: 'b1' })], []);
    expect(r.naoConciliados[0].divergencias).toContain('boleto_sem_lancamento');
    expect(r.naoConciliados[0].situacaoTesouraria).toBe('Ausente');
  });

  it('detecta lançamento sem boleto correspondente', () => {
    const orfao: LancamentoReceita = {
      id: 'receita:zz', boletoId: 'zz', unidade: '999', valor: 100, data: '2026-08-10',
      categoria: CATEGORIA_RECEITA_BOLETO, descricao: 'Órfão',
    };
    const r = conciliar([], [orfao]);
    expect(r.naoConciliados[0].divergencias).toContain('lancamento_sem_boleto');
    expect(r.naoConciliados[0].situacaoBoleto).toBe('Sem boleto');
  });

  it('detecta divergência de valor, data, unidade e categoria', () => {
    const b = boleto({ id: 'b1' });
    const errado: LancamentoReceita = {
      id: 'receita:b1', boletoId: 'b1', unidade: '999', valor: 999, data: '2026-01-01',
      categoria: 'Outra', descricao: 'x',
    };
    const r = conciliar([b], [errado]);
    const item = r.itens.find((i) => i.boletoId === 'b1')!;
    expect(item.divergencias).toEqual(expect.arrayContaining(['valor', 'data', 'unidade', 'categoria']));
    expect(item.status).toBe('divergente');
  });

  it('detecta lançamentos duplicados para o mesmo boleto', () => {
    const b = boleto({ id: 'b1' });
    const l = boletoParaLancamento(b);
    const r = conciliar([b], [l, { ...l, id: 'receita:b1#2' }]);
    const item = r.itens.find((i) => i.boletoId === 'b1')!;
    expect(item.divergencias).toContain('duplicado');
    expect(item.situacaoTesouraria).toBe('Duplicado (2)');
  });
});
