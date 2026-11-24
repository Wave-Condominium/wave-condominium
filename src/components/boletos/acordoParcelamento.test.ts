import { describe, it, expect } from 'vitest';

import { validarAcordo, PARCELAS_MIN, PARCELAS_MAX, OBS_MAX } from './acordoParcelamento';

describe('validarAcordo', () => {
  it('aceita um acordo válido e normaliza (trim na observação)', () => {
    const r = validarAcordo({ parcelas: 3, primeiraParcela: '2026-09-10', observacao: '  combinado por telefone  ' });
    expect(r).toEqual({ ok: true, acordo: { parcelas: 3, primeiraParcela: '2026-09-10', observacao: 'combinado por telefone' } });
  });

  it('aceita observação vazia', () => {
    const r = validarAcordo({ parcelas: 2, primeiraParcela: '2026-09-10' });
    expect(r.ok).toBe(true);
  });

  it('rejeita parcelas fora do intervalo', () => {
    expect(validarAcordo({ parcelas: PARCELAS_MIN - 1, primeiraParcela: '2026-09-10' }).ok).toBe(false);
    expect(validarAcordo({ parcelas: PARCELAS_MAX + 1, primeiraParcela: '2026-09-10' }).ok).toBe(false);
    expect(validarAcordo({ parcelas: 2.5, primeiraParcela: '2026-09-10' }).ok).toBe(false);
  });

  it('rejeita data inválida ou vazia', () => {
    expect(validarAcordo({ parcelas: 3, primeiraParcela: '' }).ok).toBe(false);
    expect(validarAcordo({ parcelas: 3, primeiraParcela: '10/09/2026' }).ok).toBe(false);
    expect(validarAcordo({ parcelas: 3, primeiraParcela: '2026-13-01' }).ok).toBe(false);
    expect(validarAcordo({ parcelas: 3, primeiraParcela: '2026-02-30' }).ok).toBe(false);
  });

  it('rejeita observação longa demais', () => {
    const r = validarAcordo({ parcelas: 3, primeiraParcela: '2026-09-10', observacao: 'x'.repeat(OBS_MAX + 1) });
    expect(r.ok).toBe(false);
  });
});
