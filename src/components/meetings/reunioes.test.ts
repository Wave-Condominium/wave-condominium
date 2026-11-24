import { describe, it, expect } from 'vitest';

import {
  STATUS_REUNIAO_LABEL,
  STATUS_ATA_LABEL,
  podeEditarAta,
  ehRascunhoConvocacao,
  validarNovaReuniao,
  type NovaReuniaoInput,
} from './reunioes';

function nova(overrides: Partial<NovaReuniaoInput> = {}): NovaReuniaoInput {
  return {
    title: 'Assembleia Ordinária',
    description: 'Pauta mensal',
    date: '2026-09-20',
    time: '19:00',
    duration: 120,
    meetLink: '',
    maxParticipants: 100,
    agenda: ['Aprovação da ata', 'Prestação de contas'],
    ...overrides,
  };
}

describe('status de reunião', () => {
  it('rotula os status (inclui rascunho de convocação — SÍN-026)', () => {
    expect(STATUS_REUNIAO_LABEL.draft).toBe('Rascunho');
    expect(STATUS_REUNIAO_LABEL.scheduled).toBe('Agendada');
    expect(STATUS_REUNIAO_LABEL.ongoing).toBe('Ao Vivo');
    expect(STATUS_REUNIAO_LABEL.completed).toBe('Concluída');
  });
  it('identifica um rascunho de convocação', () => {
    expect(ehRascunhoConvocacao('draft')).toBe(true);
    expect(ehRascunhoConvocacao('scheduled')).toBe(false);
    expect(ehRascunhoConvocacao('completed')).toBe(false);
  });
});

describe('ciclo da ata (Etapa B)', () => {
  it('rotula os status da ata', () => {
    expect(STATUS_ATA_LABEL.RASCUNHO).toBe('Rascunho');
    expect(STATUS_ATA_LABEL.AGUARDANDO_APROVACAO).toBe('Aguardando aprovação');
    expect(STATUS_ATA_LABEL.OFICIAL).toBe('Oficial');
  });
  it('só permite editar a ata enquanto não for oficial', () => {
    expect(podeEditarAta(undefined)).toBe(true);
    expect(podeEditarAta('RASCUNHO')).toBe(true);
    expect(podeEditarAta('AGUARDANDO_APROVACAO')).toBe(true);
    expect(podeEditarAta('OFICIAL')).toBe(false);
  });
});

describe('validarNovaReuniao', () => {
  it('aceita entrada válida', () => {
    expect(validarNovaReuniao(nova())).toBeNull();
  });
  it('exige título', () => {
    expect(validarNovaReuniao(nova({ title: '  ' }))).toMatch(/título/i);
  });
  it('exige descrição', () => {
    expect(validarNovaReuniao(nova({ description: '' }))).toMatch(/descrição/i);
  });
  it('exige data e horário', () => {
    expect(validarNovaReuniao(nova({ date: '' }))).toMatch(/data/i);
    expect(validarNovaReuniao(nova({ time: '' }))).toMatch(/horário/i);
  });
  it('exige ao menos um item de pauta (ignora vazios)', () => {
    expect(validarNovaReuniao(nova({ agenda: ['', '  '] }))).toMatch(/pauta/i);
    expect(validarNovaReuniao(nova({ agenda: [] }))).toMatch(/pauta/i);
  });
});
