import { describe, it, expect } from 'vitest';

import {
  acaoMudancaStatus,
  eventoAbertura,
  registrarAlteracao,
  formatCustoBRL,
  formatDataHora,
  type MaintenanceHistoryEntry,
} from './ordemServico';

describe('acaoMudancaStatus', () => {
  it('descreve a transição com o rótulo pt-BR', () => {
    expect(acaoMudancaStatus('progress')).toBe('Status alterado para "Em Andamento"');
    expect(acaoMudancaStatus('completed')).toBe('Status alterado para "Concluída"');
  });
});

describe('eventoAbertura', () => {
  it('cria o evento de abertura com autor e data', () => {
    const e = eventoAbertura('João Silva', '2026-08-01T10:00:00.000Z');
    expect(e).toEqual({ at: '2026-08-01T10:00:00.000Z', action: 'Ordem de serviço aberta', by: 'João Silva' });
  });

  it('usa um marcador quando o autor é vazio', () => {
    expect(eventoAbertura('', '2026-08-01').by).toBe('—');
  });
});

describe('registrarAlteracao', () => {
  it('anexa a entrada sem mutar a original e preservando o histórico anterior', () => {
    const anterior: MaintenanceHistoryEntry = { at: '2026-08-01T10:00:00.000Z', action: 'Ordem de serviço aberta', by: 'João' };
    const order = { id: 'OS-1', history: [anterior] };
    const nova: MaintenanceHistoryEntry = { at: '2026-08-02T09:00:00.000Z', action: 'Status alterado para "Em Andamento"', by: 'Maria' };

    const out = registrarAlteracao(order, nova);

    expect(out.history).toHaveLength(2);
    expect(out.history?.[1]).toEqual(nova);
    // imutabilidade
    expect(order.history).toHaveLength(1);
    expect(out).not.toBe(order);
  });

  it('funciona quando ainda não há histórico', () => {
    const semHistorico: { id: string; history?: MaintenanceHistoryEntry[] } = { id: 'OS-2' };
    const out = registrarAlteracao(semHistorico, { at: 'x', action: 'y', by: 'z' });
    expect(out.history).toHaveLength(1);
  });
});

describe('formatCustoBRL', () => {
  it('formata número em Real', () => {
    expect(formatCustoBRL(1500)).toBe('R$ 1.500,00');
  });
  it('indica ausência quando não informado', () => {
    expect(formatCustoBRL(undefined)).toBe('Não informado');
    expect(formatCustoBRL(null)).toBe('Não informado');
    expect(formatCustoBRL(NaN)).toBe('Não informado');
  });
});

describe('formatDataHora', () => {
  it('mantém valores legados (não-ISO) como estão', () => {
    expect(formatDataHora('28/11/2025')).toBe('28/11/2025');
  });
  it('marca vazio', () => {
    expect(formatDataHora('')).toBe('—');
  });
  it('formata um ISO em DD/MM/YYYY HH:mm', () => {
    const out = formatDataHora('2026-08-02T09:30:00.000Z');
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
});
