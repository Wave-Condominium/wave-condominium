import { describe, it, expect } from 'vitest';

import {
  PENDENCIA_TIPO_LABEL,
  PROXIMO_PRAZO_HORAS,
  prazoStatus,
  ordenarPendencias,
  validarMotivoDecisao,
  type Pendencia,
} from './pendencias';

const AGORA = Date.parse('2026-09-01T12:00:00.000Z');
const H = 3_600_000;

function pend(overrides: Partial<Pendencia> = {}): Pendencia {
  return {
    tipo: 'RESERVA',
    id: 'P1',
    titulo: 'Salão de Festas · 12/09',
    solicitante: 'Maria Silva',
    dataEntrada: '2026-09-01T09:00:00.000Z',
    detalhes: [],
    rejeicaoMotivoObrigatorio: false,
    ...overrides,
  };
}

describe('catálogo', () => {
  it('rotula os tipos de fonte', () => {
    expect(PENDENCIA_TIPO_LABEL.RESERVA).toMatch(/reserva/i);
    expect(PENDENCIA_TIPO_LABEL.PROPOSTA).toMatch(/proposta/i);
    expect(PENDENCIA_TIPO_LABEL.DESPESA).toMatch(/alçada|despesa/i);
    expect(PENDENCIA_TIPO_LABEL.ATA).toMatch(/ata/i);
    expect(PENDENCIA_TIPO_LABEL.MANUTENCAO).toMatch(/manuten/i);
    expect(PENDENCIA_TIPO_LABEL.CONVOCACAO).toMatch(/convoca/i);
  });
});

describe('prazoStatus', () => {
  it('sem prazo', () => {
    expect(prazoStatus(undefined, AGORA)).toBe('sem_prazo');
  });
  it('atrasada quando o prazo já passou', () => {
    expect(prazoStatus(new Date(AGORA - H).toISOString(), AGORA)).toBe('atrasado');
  });
  it('próxima dentro da janela de 48h', () => {
    expect(PROXIMO_PRAZO_HORAS).toBe(48);
    expect(prazoStatus(new Date(AGORA + 10 * H).toISOString(), AGORA)).toBe('proximo');
    expect(prazoStatus(new Date(AGORA + 48 * H).toISOString(), AGORA)).toBe('proximo');
  });
  it('no prazo quando falta mais que a janela', () => {
    expect(prazoStatus(new Date(AGORA + 72 * H).toISOString(), AGORA)).toBe('no_prazo');
  });
  it('prazo inválido é tratado como sem prazo', () => {
    expect(prazoStatus('data-invalida', AGORA)).toBe('sem_prazo');
  });
});

describe('ordenarPendencias', () => {
  it('prioriza atrasadas > próximas > no prazo > sem prazo', () => {
    const noPrazo = pend({ id: 'noPrazo', prazo: new Date(AGORA + 72 * H).toISOString() });
    const atrasada = pend({ id: 'atrasada', prazo: new Date(AGORA - H).toISOString() });
    const semPrazo = pend({ id: 'semPrazo', prazo: undefined });
    const proxima = pend({ id: 'proxima', prazo: new Date(AGORA + 5 * H).toISOString() });

    const ordem = ordenarPendencias([noPrazo, semPrazo, proxima, atrasada], AGORA).map((p) => p.id);
    expect(ordem).toEqual(['atrasada', 'proxima', 'noPrazo', 'semPrazo']);
  });

  it('em empate de urgência, prazo mais cedo primeiro', () => {
    const a = pend({ id: 'a', prazo: new Date(AGORA + 30 * H).toISOString() });
    const b = pend({ id: 'b', prazo: new Date(AGORA + 20 * H).toISOString() });
    const ordem = ordenarPendencias([a, b], AGORA).map((p) => p.id);
    expect(ordem).toEqual(['b', 'a']);
  });

  it('não muta a lista original', () => {
    const lista = [pend({ id: 'x' }), pend({ id: 'y' })];
    const copia = [...lista];
    ordenarPendencias(lista, AGORA);
    expect(lista).toEqual(copia);
  });
});

describe('validarMotivoDecisao', () => {
  it('exige motivo quando a fonte obriga (proposta)', () => {
    expect(validarMotivoDecisao({ rejeicaoMotivoObrigatorio: true }, '  ')).toMatch(/motivo/i);
    expect(validarMotivoDecisao({ rejeicaoMotivoObrigatorio: true }, 'Fora das regras')).toBeNull();
  });
  it('não exige quando a fonte não obriga (reserva)', () => {
    expect(validarMotivoDecisao({ rejeicaoMotivoObrigatorio: false }, '')).toBeNull();
  });
});
