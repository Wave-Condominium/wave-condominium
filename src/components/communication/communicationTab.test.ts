import { describe, it, expect } from 'vitest';

import { parseCommTab } from './communicationTab';

describe('parseCommTab', () => {
  it('mapeia reservas (e apelidos)', () => {
    expect(parseCommTab('reservas')).toBe('reservas');
    expect(parseCommTab('reserva')).toBe('reservas');
    expect(parseCommTab('  RESERVAS ')).toBe('reservas');
  });

  it('mapeia avisos (e apelidos)', () => {
    expect(parseCommTab('avisos')).toBe('avisos');
    expect(parseCommTab('comunicados')).toBe('avisos');
  });

  it('retorna null para ausente/desconhecido', () => {
    expect(parseCommTab(null)).toBeNull();
    expect(parseCommTab(undefined)).toBeNull();
    expect(parseCommTab('')).toBeNull();
    expect(parseCommTab('xpto')).toBeNull();
  });
});
