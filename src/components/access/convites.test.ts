import { describe, it, expect } from 'vitest';

import {
  VINCULOS,
  VINCULO_LABEL,
  TIPO_TROCA_LABEL,
  vinculoDaTroca,
  STATUS_CONVITE_LABEL,
  CONVITE_VALIDADE_HORAS,
  calcularExpiracao,
  isEmailValido,
  normalizarEmail,
  validarMorador,
  conviteExpirado,
  statusConviteView,
  podeReenviar,
  podeRevogar,
  validarAtivacao,
  MOTIVO_ATIVACAO_MENSAGEM,
  validarSenhaAtivacao,
  type ConviteAcesso,
  type MoradorInput,
} from './convites';

const AGORA = Date.parse('2026-08-28T12:00:00.000Z');
const FUTURO = new Date(AGORA + 60 * 60 * 1000).toISOString(); // +1h
const PASSADO = new Date(AGORA - 60 * 60 * 1000).toISOString(); // -1h

function morador(overrides: Partial<MoradorInput> = {}): MoradorInput {
  return { nome: 'Maria Silva', email: 'maria@exemplo.com', vinculo: 'PROPRIETARIO', ...overrides };
}

function convite(overrides: Partial<ConviteAcesso> = {}): ConviteAcesso {
  return {
    id: 'C1',
    unidadeRotulo: 'Bloco B · 302',
    nome: 'Maria Silva',
    email: 'maria@exemplo.com',
    vinculo: 'PROPRIETARIO',
    status: 'PENDENTE',
    expiresAt: FUTURO,
    criadoPor: 'Síndico João',
    criadoEm: '2026-08-28T11:00:00.000Z',
    atualizadoEm: '2026-08-28T11:00:00.000Z',
    ...overrides,
  };
}

describe('catálogos', () => {
  it('tem os 3 vínculos do card', () => {
    expect(VINCULOS).toEqual(['PROPRIETARIO', 'INQUILINO', 'DEPENDENTE']);
    expect(VINCULO_LABEL.PROPRIETARIO).toBe('Proprietário');
    expect(VINCULO_LABEL.INQUILINO).toBe('Inquilino');
    expect(VINCULO_LABEL.DEPENDENTE).toBe('Dependente');
  });

  it('rotula os 4 status apresentados (inclui EXPIRADO derivado)', () => {
    expect(STATUS_CONVITE_LABEL.PENDENTE).toBe('Pendente');
    expect(STATUS_CONVITE_LABEL.ATIVADO).toBe('Ativado');
    expect(STATUS_CONVITE_LABEL.EXPIRADO).toBe('Expirado');
    expect(STATUS_CONVITE_LABEL.REVOGADO).toBe('Revogado');
  });
});

describe('troca de morador (venda / locação)', () => {
  it('mapeia o tipo de troca ao vínculo afetado', () => {
    expect(vinculoDaTroca('VENDA')).toBe('PROPRIETARIO');
    expect(vinculoDaTroca('LOCACAO')).toBe('INQUILINO');
  });
  it('rotula os tipos de troca', () => {
    expect(TIPO_TROCA_LABEL.VENDA).toMatch(/titularidade/i);
    expect(TIPO_TROCA_LABEL.LOCACAO).toMatch(/loca/i);
  });
});

describe('validade', () => {
  it('expira 72h após a criação', () => {
    expect(CONVITE_VALIDADE_HORAS).toBe(72);
    const exp = calcularExpiracao(AGORA);
    expect(exp.getTime()).toBe(AGORA + 72 * 60 * 60 * 1000);
  });
});

describe('isEmailValido', () => {
  it('aceita e-mails válidos', () => {
    expect(isEmailValido('maria@exemplo.com')).toBe(true);
    expect(isEmailValido('  maria.silva@sub.dominio.com.br ')).toBe(true);
  });
  it('rejeita inválidos', () => {
    expect(isEmailValido('maria')).toBe(false);
    expect(isEmailValido('maria@exemplo')).toBe(false);
    expect(isEmailValido('maria @exemplo.com')).toBe(false);
    expect(isEmailValido('')).toBe(false);
  });
  it('normaliza para minúsculas e sem espaços', () => {
    expect(normalizarEmail('  Maria@Exemplo.COM ')).toBe('maria@exemplo.com');
  });
});

describe('validarMorador', () => {
  it('aceita entrada válida', () => {
    expect(validarMorador(morador())).toBeNull();
  });
  it('exige nome completo', () => {
    expect(validarMorador(morador({ nome: 'Jo' }))).toMatch(/nome completo/i);
  });
  it('exige e-mail válido', () => {
    expect(validarMorador(morador({ email: 'invalido' }))).toMatch(/e-mail/i);
  });
  it('exige vínculo válido', () => {
    expect(validarMorador({ nome: 'Maria Silva', email: 'maria@exemplo.com' })).toMatch(/vínculo/i);
    // @ts-expect-error valor fora do enum
    expect(validarMorador(morador({ vinculo: 'OUTRO' }))).toMatch(/vínculo/i);
  });
  it('telefone é opcional', () => {
    expect(validarMorador(morador({ telefone: undefined }))).toBeNull();
  });
});

describe('derivação de status', () => {
  it('PENDENTE vencido é EXPIRADO', () => {
    const c = convite({ status: 'PENDENTE', expiresAt: PASSADO });
    expect(conviteExpirado(c, AGORA)).toBe(true);
    expect(statusConviteView(c, AGORA)).toBe('EXPIRADO');
  });
  it('PENDENTE dentro do prazo permanece PENDENTE', () => {
    const c = convite({ status: 'PENDENTE', expiresAt: FUTURO });
    expect(conviteExpirado(c, AGORA)).toBe(false);
    expect(statusConviteView(c, AGORA)).toBe('PENDENTE');
  });
  it('ATIVADO nunca é considerado expirado, mesmo com prazo vencido', () => {
    const c = convite({ status: 'ATIVADO', expiresAt: PASSADO });
    expect(conviteExpirado(c, AGORA)).toBe(false);
    expect(statusConviteView(c, AGORA)).toBe('ATIVADO');
  });
  it('REVOGADO permanece REVOGADO', () => {
    const c = convite({ status: 'REVOGADO', expiresAt: PASSADO });
    expect(statusConviteView(c, AGORA)).toBe('REVOGADO');
  });
});

describe('regras de transição', () => {
  it('reenvio disponível apenas p/ PENDENTE ou EXPIRADO', () => {
    expect(podeReenviar('PENDENTE')).toBe(true);
    expect(podeReenviar('EXPIRADO')).toBe(true);
    expect(podeReenviar('ATIVADO')).toBe(false);
    expect(podeReenviar('REVOGADO')).toBe(false);
  });
  it('revogação disponível exceto p/ já revogado', () => {
    expect(podeRevogar('PENDENTE')).toBe(true);
    expect(podeRevogar('EXPIRADO')).toBe(true);
    expect(podeRevogar('ATIVADO')).toBe(true);
    expect(podeRevogar('REVOGADO')).toBe(false);
  });
});

describe('validarAtivacao (uso único + segurança)', () => {
  it('permite ativar convite PENDENTE dentro do prazo', () => {
    expect(validarAtivacao(convite({ status: 'PENDENTE', expiresAt: FUTURO }), AGORA)).toEqual({ ok: true });
  });
  it('bloqueia reutilização de convite ATIVADO (uso único)', () => {
    const r = validarAtivacao(convite({ status: 'ATIVADO' }), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'ja_ativado' });
  });
  it('bloqueia convite revogado', () => {
    const r = validarAtivacao(convite({ status: 'REVOGADO' }), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'revogado' });
  });
  it('bloqueia convite expirado', () => {
    const r = validarAtivacao(convite({ status: 'PENDENTE', expiresAt: PASSADO }), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'expirado' });
  });
  it('revogado tem prioridade sobre expirado', () => {
    const r = validarAtivacao(convite({ status: 'REVOGADO', expiresAt: PASSADO }), AGORA);
    expect(r).toEqual({ ok: false, motivo: 'revogado' });
  });
  it('cada motivo tem mensagem amigável', () => {
    expect(MOTIVO_ATIVACAO_MENSAGEM.ja_ativado).toMatch(/já foi utilizado/i);
    expect(MOTIVO_ATIVACAO_MENSAGEM.revogado).toMatch(/revogado/i);
    expect(MOTIVO_ATIVACAO_MENSAGEM.expirado).toMatch(/expirou/i);
  });
});

describe('validarSenhaAtivacao', () => {
  it('aceita senha forte e confirmada', () => {
    expect(validarSenhaAtivacao('senhaSegura1', 'senhaSegura1')).toBeNull();
  });
  it('rejeita senha curta', () => {
    expect(validarSenhaAtivacao('123', '123')).toMatch(/pelo menos/i);
  });
  it('rejeita confirmação divergente', () => {
    expect(validarSenhaAtivacao('senhaSegura1', 'outra')).toMatch(/não coincidem/i);
  });
});
