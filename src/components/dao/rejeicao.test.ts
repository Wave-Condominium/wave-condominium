import { describe, it, expect } from 'vitest';

import { validarMotivoRejeicao, MOTIVO_MIN, MOTIVO_MAX } from './rejeicao';

describe('validarMotivoRejeicao', () => {
  it('rejeita motivo vazio ou só espaços', () => {
    expect(validarMotivoRejeicao('')).toEqual({ ok: false, erro: 'Informe o motivo da rejeição.' });
    expect(validarMotivoRejeicao('   ')).toEqual({ ok: false, erro: 'Informe o motivo da rejeição.' });
    expect(validarMotivoRejeicao(null)).toEqual({ ok: false, erro: 'Informe o motivo da rejeição.' });
    expect(validarMotivoRejeicao(undefined)).toEqual({ ok: false, erro: 'Informe o motivo da rejeição.' });
  });

  it('rejeita motivo curto demais', () => {
    const r = validarMotivoRejeicao('abc');
    expect(r.ok).toBe(false);
  });

  it('rejeita motivo longo demais', () => {
    const r = validarMotivoRejeicao('x'.repeat(MOTIVO_MAX + 1));
    expect(r.ok).toBe(false);
  });

  it('aceita motivo válido e faz trim', () => {
    const r = validarMotivoRejeicao('  Fora do escopo do orçamento aprovado  ');
    expect(r).toEqual({ ok: true, motivo: 'Fora do escopo do orçamento aprovado' });
  });

  it('aceita exatamente no limite mínimo', () => {
    const r = validarMotivoRejeicao('x'.repeat(MOTIVO_MIN));
    expect(r.ok).toBe(true);
  });
});
