import { describe, it, expect } from 'vitest';

import {
  STATUS_SOLICITACAO_LABEL,
  PRIORIDADE_LABEL,
  validarNovaSolicitacao,
  gerarProtocolo,
  type NovaSolicitacaoInput,
} from './solicitacoes';

function nova(overrides: Partial<NovaSolicitacaoInput> = {}): NovaSolicitacaoInput {
  return { titulo: 'Vazamento na pia', categoria: 'Hidráulica', prioridade: 'medium', descricao: 'Pia da cozinha vazando', ...overrides };
}

describe('catálogos', () => {
  it('rotula status e prioridades', () => {
    expect(STATUS_SOLICITACAO_LABEL.aguardando).toMatch(/aguardando/i);
    expect(STATUS_SOLICITACAO_LABEL.em_andamento).toMatch(/andamento/i);
    expect(STATUS_SOLICITACAO_LABEL.recusada).toMatch(/recusada/i);
    expect(PRIORIDADE_LABEL.high).toBe('Alta');
  });
});

describe('validarNovaSolicitacao', () => {
  it('aceita entrada válida', () => {
    expect(validarNovaSolicitacao(nova())).toBeNull();
  });
  it('exige título, categoria e descrição', () => {
    expect(validarNovaSolicitacao(nova({ titulo: ' ' }))).toMatch(/título/i);
    expect(validarNovaSolicitacao(nova({ categoria: '' }))).toMatch(/categoria/i);
    expect(validarNovaSolicitacao(nova({ descricao: '' }))).toMatch(/problema|descri/i);
  });
});

describe('gerarProtocolo', () => {
  it('gera protocolo com o ano no início', () => {
    const t = Date.parse('2026-09-04T12:00:00.000Z');
    expect(gerarProtocolo(t)).toMatch(/^2026-\d{6}$/);
  });
});
