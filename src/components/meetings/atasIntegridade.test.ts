import { describe, it, expect } from 'vitest';

import { calcularHashAta, verificarIntegridade } from './atasIntegridade';

describe('calcularHashAta', () => {
  it('é determinístico para o mesmo conteúdo', () => {
    expect(calcularHashAta('Ata da reunião')).toBe(calcularHashAta('Ata da reunião'));
  });

  it('ignora diferenças de CRLF/espaços nas bordas', () => {
    expect(calcularHashAta('Linha 1\r\nLinha 2')).toBe(calcularHashAta('  Linha 1\nLinha 2  '));
  });

  it('muda quando o conteúdo muda', () => {
    expect(calcularHashAta('conteúdo A')).not.toBe(calcularHashAta('conteúdo B'));
  });
});

describe('verificarIntegridade', () => {
  it('retorna integra quando o conteúdo confere com o código registrado', () => {
    const conteudo = 'Ata: aprovação de contas.';
    const hash = calcularHashAta(conteudo);
    expect(verificarIntegridade(conteudo, hash)).toBe('integra');
  });

  it('retorna alterada quando o conteúdo diverge', () => {
    const hash = calcularHashAta('versão oficial');
    expect(verificarIntegridade('versão adulterada', hash)).toBe('alterada');
  });

  it('retorna sem_registro quando não há código oficial', () => {
    expect(verificarIntegridade('qualquer', undefined)).toBe('sem_registro');
    expect(verificarIntegridade('qualquer', '')).toBe('sem_registro');
  });

  it('compara sem diferenciar caixa do código registrado', () => {
    const conteudo = 'x';
    const hash = calcularHashAta(conteudo);
    expect(verificarIntegridade(conteudo, hash.toLowerCase())).toBe('integra');
  });
});
