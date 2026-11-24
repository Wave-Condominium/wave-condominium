import { describe, it, expect } from 'vitest';

import { temLinkReuniaoValido } from './meetingUtils';

describe('temLinkReuniaoValido', () => {
  it('aceita links http(s) válidos', () => {
    expect(temLinkReuniaoValido('https://meet.google.com/abc-defg-hij')).toBe(true);
    expect(temLinkReuniaoValido('http://zoom.us/j/123')).toBe(true);
    expect(temLinkReuniaoValido('  https://meet.google.com/x  ')).toBe(true);
  });

  it('rejeita ausência, vazio ou espaços', () => {
    expect(temLinkReuniaoValido(undefined)).toBe(false);
    expect(temLinkReuniaoValido(null)).toBe(false);
    expect(temLinkReuniaoValido('')).toBe(false);
    expect(temLinkReuniaoValido('   ')).toBe(false);
  });

  it('rejeita valores que não são URL http(s)', () => {
    expect(temLinkReuniaoValido('em breve')).toBe(false);
    expect(temLinkReuniaoValido('meet.google.com/abc')).toBe(false);
    expect(temLinkReuniaoValido('ftp://x')).toBe(false);
  });
});
