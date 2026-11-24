import { describe, it, expect } from 'vitest';

import { selectAtencaoItems } from './moradorAtencao';
import type { Aviso } from '../communication/types';
import type { SolicitacaoServico } from './moradorDashboardTypes';

function aviso(overrides: Partial<Aviso> = {}): Aviso {
  return {
    id: 'A1',
    titulo: 'Comunicado',
    conteudo: 'Corpo',
    categoria: 'comunicado',
    prioridade: 'normal',
    autor: 'Síndico',
    dataPublicacao: '2026-08-01T10:00:00.000Z',
    comentariosAtivos: false,
    ...overrides,
  };
}

function solicitacao(overrides: Partial<SolicitacaoServico> = {}): SolicitacaoServico {
  return {
    id: 'S1',
    protocolo: 'OS-1001',
    unidade: '203',
    tipo: 'Vazamento na cozinha',
    aberturaEm: '2026-08-01T10:00:00.000Z',
    status: 'aberta',
    atualizadoEm: '2026-08-02T10:00:00.000Z',
    ...overrides,
  };
}

describe('selectAtencaoItems — comunicados', () => {
  it('inclui apenas comunicados urgentes/altos', () => {
    const items = selectAtencaoItems({
      comunicados: [
        aviso({ id: 'U', prioridade: 'urgente' }),
        aviso({ id: 'A', prioridade: 'alta' }),
        aviso({ id: 'N', prioridade: 'normal' }),
      ],
      solicitacoes: [],
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('comunicado:U');
    expect(ids).toContain('comunicado:A');
    expect(ids).not.toContain('comunicado:N'); // normal não sobe para atenção
  });
});

describe('selectAtencaoItems — solicitações da unidade', () => {
  it('inclui apenas solicitações abertas ou em andamento', () => {
    const items = selectAtencaoItems({
      comunicados: [],
      solicitacoes: [
        solicitacao({ id: 'AB', status: 'aberta' }),
        solicitacao({ id: 'AND', status: 'em_andamento' }),
        solicitacao({ id: 'CON', status: 'concluida' }),
        solicitacao({ id: 'CAN', status: 'cancelada' }),
      ],
    });
    const ids = items.map((i) => i.id);
    expect(ids).toContain('solicitacao:AB');
    expect(ids).toContain('solicitacao:AND');
    expect(ids).not.toContain('solicitacao:CON');
    expect(ids).not.toContain('solicitacao:CAN');
  });
});

describe('selectAtencaoItems — ordenação', () => {
  it('ordena por nível (urgente > alta > média) e depois por data desc', () => {
    const items = selectAtencaoItems({
      comunicados: [
        aviso({ id: 'ALTA', prioridade: 'alta', dataPublicacao: '2026-08-10T00:00:00.000Z' }),
        aviso({ id: 'URG', prioridade: 'urgente', dataPublicacao: '2026-08-01T00:00:00.000Z' }),
      ],
      solicitacoes: [
        solicitacao({ id: 'AND', status: 'em_andamento', atualizadoEm: '2026-08-20T00:00:00.000Z' }),
      ],
    });
    // URG (urgente) primeiro, depois ALTA, depois AND (média) por último —
    // mesmo a solicitação sendo a mais recente, o nível manda.
    expect(items.map((i) => i.id)).toEqual([
      'comunicado:URG',
      'comunicado:ALTA',
      'solicitacao:AND',
    ]);
  });

  it('retorna vazio quando nada exige atenção', () => {
    const items = selectAtencaoItems({
      comunicados: [aviso({ prioridade: 'normal' })],
      solicitacoes: [solicitacao({ status: 'concluida' })],
    });
    expect(items).toEqual([]);
  });

  it('não muta os arrays de entrada', () => {
    const comunicados = [aviso({ prioridade: 'urgente' })];
    const solicitacoes = [solicitacao({ status: 'aberta' })];
    const snapC = [...comunicados];
    const snapS = [...solicitacoes];
    selectAtencaoItems({ comunicados, solicitacoes });
    expect(comunicados).toEqual(snapC);
    expect(solicitacoes).toEqual(snapS);
  });
});
