"use server";

// ---------------------------------------------------------------------------
// src/app/actions/onboarding.ts  —  SÍN-030
//
// Onboarding do condomínio: cadastro (CNPJ, endereço, banco, responsável),
// vínculo do responsável e início da subconta no PSP (simulado). Segurança
// (validada NO SERVIDOR): apenas gestão (Síndico/Administradora/Admin) — o
// Morador é barrado por `requireManager`. A cadeia Usuário → Permissão →
// Condomínio → Recurso é reforçada em cada operação por condomínio.
// ---------------------------------------------------------------------------

import { requireManager, requireSession } from "@/server/auth/guard";
import { isAdministradora, isPlatformAdmin } from "@/lib/rbac";
import { condominiumRepository } from "@/server/repositories/condominiumRepository";
import { membershipRepository } from "@/server/repositories/membershipRepository";
import { pspAdapter } from "@/server/psp/pspAdapter";
import { formatCNPJ } from "@/lib/validators";
import {
  validarNovoCondominio,
  normalizarCnpj,
  proximoStatusPsp,
  aptoParaFinanceiro,
  type NovoCondominioInput,
  type PspStatus,
} from "@/components/onboarding/condominioOnboarding";
import type { StatusOnboardingPsp as PrismaPspStatus } from "@prisma/client";

export type CriarCondominioResult =
  | { ok: true; condominiumId: string; pspStatus: PspStatus; pspSubcontaId: string }
  | { ok: false; error: string };

export async function criarCondominioAction(input: NovoCondominioInput): Promise<CriarCondominioResult> {
  // Barra o Morador (e não autenticados). Só gestão cadastra condomínio.
  const session = await requireManager();

  const erro = validarNovoCondominio(input);
  if (erro) return { ok: false, error: erro };

  const digits = normalizarCnpj(input.cnpj);

  // Regra: 1 CNPJ = 1 condomínio (impede duplicidade, tolera grafia legada).
  const jaExiste = await condominiumRepository.findByCnpjEquivalente(digits);
  if (jaExiste) return { ok: false, error: "Já existe um condomínio cadastrado com este CNPJ." };

  // Administradora cadastra sob si; Síndico independente cria um condo "avulso".
  const administradoraId = isAdministradora(session.role) ? session.administradoraId ?? null : null;

  const condo = await condominiumRepository.create({
    name: input.nome.trim(),
    cnpj: digits,
    administradoraId,
    cep: input.endereco.cep,
    logradouro: input.endereco.logradouro.trim(),
    numero: input.endereco.numero.trim(),
    complemento: input.endereco.complemento?.trim() || null,
    bairro: input.endereco.bairro.trim(),
    cidade: input.endereco.cidade.trim(),
    uf: input.endereco.uf.trim().toUpperCase(),
    bancoNome: input.banco.banco.trim(),
    bancoAgencia: input.banco.agencia.trim(),
    bancoConta: input.banco.conta.trim(),
    bancoTipoConta: input.banco.tipoConta,
    pixChave: input.banco.pixChave?.trim() || null,
    responsavelNome: input.responsavel.nome.trim(),
    responsavelEmail: input.responsavel.email.trim().toLowerCase(),
    responsavelTelefone: input.responsavel.telefone.trim(),
    responsavelRelacao: input.responsavel.relacao,
    consentimentoRepresentacao: true,
    consentimentoEm: new Date(),
    pspStatus: "NAO_INICIADO",
  });

  // Vínculo do responsável (SÍN-031): o Síndico que cadastra vira SINDICO do novo
  // condomínio. A Administradora já acessa via administradoraId (sem membership).
  if (!isAdministradora(session.role) && !isPlatformAdmin(session.role)) {
    await membershipRepository.upsert(session.userId, condo.id, "SINDICO");
  }

  // Inicia a subconta no PSP (simulado) e registra o status retornado.
  const sub = await pspAdapter.criarSubconta({
    cnpj: digits,
    razaoSocial: input.nome.trim(),
    responsavelEmail: input.responsavel.email.trim().toLowerCase(),
  });
  await condominiumRepository.updatePsp(condo.id, {
    pspSubcontaId: sub.subcontaId,
    pspStatus: sub.status as PrismaPspStatus,
    pspAtualizadoEm: new Date(),
  });

  return { ok: true, condominiumId: condo.id, pspStatus: sub.status, pspSubcontaId: sub.subcontaId };
}

// --- Autorização por condomínio (gestor do condomínio-alvo) ------------------

async function autorizarGestor(condominiumId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  if (isPlatformAdmin(session.role)) return { ok: true };

  const condo = await condominiumRepository.findById(condominiumId);
  if (!condo) return { ok: false, error: "Condomínio não encontrado." };

  if (isAdministradora(session.role)) {
    if ((condo as any).administradoraId && (condo as any).administradoraId === session.administradoraId) {
      return { ok: true };
    }
    return { ok: false, error: "Sem permissão para este condomínio." };
  }

  // Síndico: precisa de vínculo de gestão (SINDICO) no condomínio-alvo.
  const vinc = await membershipRepository.findByUserAndCondominium(session.userId, condominiumId);
  if (vinc && (vinc as any).role === "SINDICO") return { ok: true };
  return { ok: false, error: "Sem permissão para este condomínio." };
}

export type PspStepResult = { ok: true; pspStatus: PspStatus; apto: boolean } | { ok: false; error: string };

/**
 * Avança uma etapa do onboarding no PSP (simulação do KYC/aprovação). Na vida
 * real, isto seria um webhook do PSP; aqui é acionado pela gestão para demonstrar
 * a progressão até APTO. Só gestores do condomínio-alvo podem acionar.
 */
export async function avancarOnboardingPspAction(condominiumId: string): Promise<PspStepResult> {
  await requireManager();
  const autorizado = await autorizarGestor(condominiumId);
  if (!autorizado.ok) return { ok: false, error: autorizado.error };

  const condo = await condominiumRepository.findById(condominiumId);
  const atual = ((condo as any)?.pspStatus ?? "NAO_INICIADO") as PspStatus;
  const proximo = proximoStatusPsp(atual);
  if (!proximo) return { ok: false, error: "Não há próxima etapa para o status atual." };

  await condominiumRepository.updatePsp(condominiumId, {
    pspStatus: proximo as PrismaPspStatus,
    pspAtualizadoEm: new Date(),
  });
  return { ok: true, pspStatus: proximo, apto: aptoParaFinanceiro(proximo) };
}

export interface OnboardingStatus {
  condominiumId: string;
  name: string;
  cnpj: string;
  pspStatus: PspStatus;
  pspSubcontaId: string | null;
  apto: boolean;
}

export type OnboardingStatusResult = { ok: true; status: OnboardingStatus } | { ok: false; error: string };

/** Estado do onboarding/PSP de um condomínio (para a tela de acompanhamento). */
export async function getOnboardingStatusAction(condominiumId: string): Promise<OnboardingStatusResult> {
  const autorizado = await autorizarGestor(condominiumId);
  if (!autorizado.ok) return { ok: false, error: autorizado.error };

  const condo = await condominiumRepository.findById(condominiumId);
  if (!condo) return { ok: false, error: "Condomínio não encontrado." };

  const pspStatus = ((condo as any).pspStatus ?? "NAO_INICIADO") as PspStatus;
  const rawCnpj = (condo as any).cnpj ?? "";
  return {
    ok: true,
    status: {
      condominiumId: condo.id,
      name: (condo as any).name,
      cnpj: rawCnpj ? formatCNPJ(rawCnpj) : "",
      pspStatus,
      pspSubcontaId: (condo as any).pspSubcontaId ?? null,
      apto: aptoParaFinanceiro(pspStatus),
    },
  };
}
