// ---------------------------------------------------------------------------
// src/server/psp/pspAdapter.ts  —  SÍN-030 (server-only)
//
// SEAM de integração com o PSP (Prestador de Serviço de Pagamento). O card
// PAG-002 definirá o provedor real; aqui expomos a INTERFACE e uma implementação
// SIMULADA. Quando a integração real chegar, basta trocar `pspAdapter` pela
// implementação concreta — nada mais no app muda (mesmo contrato).
//
// A criação da subconta devolve um id externo e o próximo status do fluxo de
// onboarding (subconta criada → aguardando KYC do responsável). A progressão do
// KYC é simulada por `avancarOnboardingPspAction` (na vida real: webhook do PSP).
// ---------------------------------------------------------------------------

import type { PspStatus } from "@/components/onboarding/condominioOnboarding";

export interface CriarSubcontaInput {
  cnpj: string; // dígitos
  razaoSocial: string;
  responsavelEmail: string;
}

export interface CriarSubcontaResult {
  subcontaId: string;
  status: PspStatus;
}

export interface PspAdapter {
  criarSubconta(input: CriarSubcontaInput): Promise<CriarSubcontaResult>;
}

/**
 * Implementação SIMULADA: gera um id de subconta a partir do CNPJ e coloca o
 * processo em KYC_PENDENTE (subconta criada, KYC do responsável pendente).
 * Não faz nenhuma chamada externa.
 */
export const simuladoPspAdapter: PspAdapter = {
  async criarSubconta(input) {
    const digits = (input.cnpj || "").replace(/\D/g, "").slice(0, 14);
    const subcontaId = `psp_sub_${digits}_${Date.now().toString(36)}`;
    return { subcontaId, status: "KYC_PENDENTE" };
  },
};

// Ponto único trocado quando o PSP real (PAG-002) entrar.
export const pspAdapter: PspAdapter = simuladoPspAdapter;
