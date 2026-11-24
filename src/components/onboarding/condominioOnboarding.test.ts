import { describe, it, expect } from 'vitest';

import {
  proximoStatusPsp,
  aptoParaFinanceiro,
  validarNovoCondominio,
  normalizarCnpj,
  PSP_STATUS_LABEL,
  type NovoCondominioInput,
} from './condominioOnboarding';

// CNPJ válido de teste (dígitos verificadores corretos).
const CNPJ_OK = '11.222.333/0001-81';

function novo(overrides: Partial<NovoCondominioInput> = {}): NovoCondominioInput {
  return {
    nome: 'Condomínio Teste',
    cnpj: CNPJ_OK,
    endereco: {
      cep: '01001-000', logradouro: 'Praça da Sé', numero: '100',
      bairro: 'Sé', cidade: 'São Paulo', uf: 'SP',
    },
    banco: { banco: 'Banco Teste', agencia: '0001', conta: '12345-6', tipoConta: 'CORRENTE' },
    responsavel: { nome: 'Ana Síndica', email: 'ana@wave.com', telefone: '(11) 90000-0000', relacao: 'SINDICO' },
    consentimentoRepresentacao: true,
    ...overrides,
  };
}

describe('máquina de estados do PSP', () => {
  it('avança no fluxo feliz até APTO', () => {
    expect(proximoStatusPsp('NAO_INICIADO')).toBe('SUBCONTA_CRIANDO');
    expect(proximoStatusPsp('SUBCONTA_CRIANDO')).toBe('KYC_PENDENTE');
    expect(proximoStatusPsp('KYC_PENDENTE')).toBe('EM_ANALISE');
    expect(proximoStatusPsp('EM_ANALISE')).toBe('APTO');
  });
  it('APTO e RECUSADO são terminais', () => {
    expect(proximoStatusPsp('APTO')).toBeNull();
    expect(proximoStatusPsp('RECUSADO')).toBeNull();
  });
  it('só é apto a operar financeiramente quando APTO', () => {
    expect(aptoParaFinanceiro('APTO')).toBe(true);
    expect(aptoParaFinanceiro('KYC_PENDENTE')).toBe(false);
    expect(aptoParaFinanceiro('EM_ANALISE')).toBe(false);
    expect(aptoParaFinanceiro('NAO_INICIADO')).toBe(false);
  });
  it('rotula todos os status', () => {
    expect(PSP_STATUS_LABEL.APTO).toMatch(/apto/i);
    expect(PSP_STATUS_LABEL.KYC_PENDENTE).toMatch(/kyc/i);
  });
});

describe('validarNovoCondominio', () => {
  it('aceita um cadastro completo e válido', () => {
    expect(validarNovoCondominio(novo())).toBeNull();
  });
  it('exige CNPJ válido', () => {
    expect(validarNovoCondominio(novo({ cnpj: '11.111.111/1111-11' }))).toMatch(/cnpj/i);
    expect(validarNovoCondominio(novo({ cnpj: '' }))).toMatch(/cnpj/i);
  });
  it('exige endereço com CEP e UF válidos', () => {
    expect(validarNovoCondominio(novo({ endereco: { ...novo().endereco, cep: '123' } }))).toMatch(/cep/i);
    expect(validarNovoCondominio(novo({ endereco: { ...novo().endereco, uf: 'São Paulo' } }))).toMatch(/uf/i);
  });
  it('exige dados bancários', () => {
    expect(validarNovoCondominio(novo({ banco: { ...novo().banco, conta: '' } }))).toMatch(/conta/i);
  });
  it('exige e-mail válido do responsável', () => {
    expect(validarNovoCondominio(novo({ responsavel: { ...novo().responsavel, email: 'invalido' } }))).toMatch(/e-mail/i);
  });
  it('exige o consentimento de representação (arts. 1.347–1.349)', () => {
    expect(validarNovoCondominio(novo({ consentimentoRepresentacao: false }))).toMatch(/representa|consentimento/i);
  });
});

describe('normalizarCnpj', () => {
  it('mantém apenas dígitos (base da unicidade)', () => {
    expect(normalizarCnpj('11.222.333/0001-81')).toBe('11222333000181');
  });
});
