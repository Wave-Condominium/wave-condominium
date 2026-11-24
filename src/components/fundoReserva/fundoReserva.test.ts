import { describe, it, expect } from 'vitest';

import {
  total,
  estaDesatualizado,
  consentimentoVencido,
  precisaReconectar,
  podeExibirValores,
  SNAPSHOT_VALIDADE_HORAS,
  STATUS_CONEXAO_LABEL,
} from './fundoReserva';

const AGORA = Date.parse('2026-09-08T12:00:00.000Z');
const H = 3_600_000;

describe('total', () => {
  it('soma disponível + investido', () => {
    expect(total(100000, 50000)).toBe(150000);
  });
});

describe('estaDesatualizado', () => {
  it('sem snapshot conta como desatualizado', () => {
    expect(estaDesatualizado(null, AGORA)).toBe(true);
  });
  it('dentro da janela de validade → atualizado', () => {
    const recente = new Date(AGORA - (SNAPSHOT_VALIDADE_HORAS - 1) * H).toISOString();
    expect(estaDesatualizado(recente, AGORA)).toBe(false);
  });
  it('além da janela → desatualizado', () => {
    const velho = new Date(AGORA - (SNAPSHOT_VALIDADE_HORAS + 1) * H).toISOString();
    expect(estaDesatualizado(velho, AGORA)).toBe(true);
  });
});

describe('consentimentoVencido', () => {
  it('futuro → não vencido; passado → vencido', () => {
    expect(consentimentoVencido(new Date(AGORA + H).toISOString(), AGORA)).toBe(false);
    expect(consentimentoVencido(new Date(AGORA - H).toISOString(), AGORA)).toBe(true);
  });
  it('sem data → não vencido', () => {
    expect(consentimentoVencido(null, AGORA)).toBe(false);
  });
});

describe('precisaReconectar / podeExibirValores', () => {
  const futuro = new Date(AGORA + 100 * H).toISOString();
  it('conectado com consentimento válido: não reconecta, pode exibir', () => {
    expect(precisaReconectar('CONECTADO', futuro, AGORA)).toBe(false);
    expect(podeExibirValores({ status: 'CONECTADO', consentimentoExpiraEm: futuro }, AGORA)).toBe(true);
  });
  it('não conectado: precisa reconectar, não exibe', () => {
    expect(precisaReconectar('DESCONECTADO', null, AGORA)).toBe(true);
    expect(precisaReconectar('EXPIRADO', futuro, AGORA)).toBe(true);
    expect(podeExibirValores({ status: 'ERRO', consentimentoExpiraEm: futuro }, AGORA)).toBe(false);
  });
  it('conectado mas consentimento vencido: precisa reconectar', () => {
    const passado = new Date(AGORA - H).toISOString();
    expect(precisaReconectar('CONECTADO', passado, AGORA)).toBe(true);
    expect(podeExibirValores({ status: 'CONECTADO', consentimentoExpiraEm: passado }, AGORA)).toBe(false);
  });
});

describe('catálogo', () => {
  it('rotula os status da conexão', () => {
    expect(STATUS_CONEXAO_LABEL.CONECTADO).toMatch(/conectado/i);
    expect(STATUS_CONEXAO_LABEL.EXPIRADO).toMatch(/expirad/i);
  });
});
