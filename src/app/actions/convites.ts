"use server";

// ---------------------------------------------------------------------------
// src/app/actions/convites.ts
//
// Server Actions dos Convites de Acesso de moradores (SÍN-022).
//
// Segurança (validada NO SERVIDOR):
//   - GESTÃO (listar/gerar/reenviar/revogar): exige gestão (requireManager) e é
//     escopada por session.condominiumId — um condomínio nunca vê/gere convites
//     de outro (multi-tenant);
//   - ATIVAÇÃO/CONSULTA por token: PÚBLICAS (sem sessão) — o token é o portador
//     da autorização; validadas por hash, expiração, revogação e uso único.
//
// A senha é definida EXCLUSIVAMENTE pelo morador na ativação. O Síndico nunca a
// define nem a vê. O token em claro só é devolvido no momento da geração/reenvio
// (para o link copiável) e NUNCA é persistido — o banco guarda só o SHA-256.
//
// Requer `prisma generate` após o schema (model ConviteAcesso + enums).
// ---------------------------------------------------------------------------

import { requireManager } from "@/server/auth/guard";
import { conviteRepository } from "@/server/repositories/conviteRepository";
import { unidadeRepository } from "@/server/repositories/unidadeRepository";
import { userRepository } from "@/server/repositories/userRepository";
import { ativarAcessoMorador } from "@/server/services/authService";
import { gerarToken, hashToken } from "@/server/access/token";
import { getEmailService } from "@/server/access/email";
import { registrarEventoSeguranca } from "@/server/security/registrarEventoSeguranca";
import {
  validarMorador,
  validarSenhaAtivacao,
  validarAtivacao,
  normalizarEmail,
  calcularExpiracao,
  statusConviteView,
  podeReenviar,
  podeRevogar,
  vinculoDaTroca,
  MOTIVO_ATIVACAO_MENSAGEM,
  type ConviteAcesso,
  type MoradorInput,
  type MotivoAtivacaoInvalida,
  type TipoTroca,
  type VinculoMorador,
} from "@/components/access/convites";
import { rotuloUnidade } from "@/components/units/unidades";

// --- Mapeamento banco -> app (NUNCA expõe tokenHash) -------------------------

function toApp(c: any): ConviteAcesso {
  return {
    id: c.id,
    unidadeId: c.unidadeId ?? undefined,
    unidadeRotulo: c.unidadeRotulo,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone ?? undefined,
    vinculo: c.vinculo,
    status: c.status,
    expiresAt: new Date(c.expiresAt).toISOString(),
    usuarioId: c.usuarioId ?? undefined,
    usadoEm: c.usadoEm ? new Date(c.usadoEm).toISOString() : undefined,
    revogadoEm: c.revogadoEm ? new Date(c.revogadoEm).toISOString() : undefined,
    revogadoPor: c.revogadoPor ?? undefined,
    criadoPor: c.criadoPor,
    criadoEm: new Date(c.criadoEm).toISOString(),
    atualizadoEm: new Date(c.atualizadoEm).toISOString(),
  };
}

function ativacaoPath(token: string): string {
  return `/ativar/${token}`;
}

// --- Tipos de resultado ------------------------------------------------------

export interface ConviteGerado {
  convite: ConviteAcesso;
  /** Caminho relativo de ativação — a UI compõe a origem para o link copiável. */
  ativacaoPath: string;
  /** Token em claro (devolvido só aqui; não é persistido). */
  token: string;
  /** True quando a entrega de e-mail foi apenas simulada. */
  emailSimulado: boolean;
}

export type GerarConviteResult =
  | { ok: true; resultado: ConviteGerado }
  | { ok: false; error: string };

export type ReenviarConviteResult = GerarConviteResult;

export type RevogarConviteResult =
  | { ok: true; convite: ConviteAcesso }
  | { ok: false; error: string };

// --- Leitura (gestor) --------------------------------------------------------

/** Lista os convites do condomínio ativo (gestão). */
export async function listConvitesAction(): Promise<ConviteAcesso[]> {
  const session = await requireManager();
  if (!session.condominiumId) return [];
  const rows = await conviteRepository.listByCondominium(session.condominiumId);
  return rows.map(toApp);
}

// --- Helper interno: cria o convite + "envia" o e-mail (DRY) ------------------
//
// Não é uma Server Action (não exportado). Gera token/hash, persiste o convite
// e dispara a entrega (simulada). Reusado pela geração avulsa e pela troca de
// morador (venda/locação).

async function criarEEnviarConvite(params: {
  condominiumId: string;
  unidadeId: string | null;
  unidadeRotulo: string;
  nome: string;
  email: string;
  telefone: string | null;
  vinculo: VinculoMorador;
  criadoPor: string;
}): Promise<ConviteGerado> {
  const { token, tokenHash } = gerarToken();
  const expiresAt = calcularExpiracao();

  const row = await conviteRepository.create({
    condominiumId: params.condominiumId,
    unidadeId: params.unidadeId,
    unidadeRotulo: params.unidadeRotulo,
    nome: params.nome,
    email: params.email,
    telefone: params.telefone,
    vinculo: params.vinculo,
    tokenHash,
    expiresAt,
    criadoPor: params.criadoPor,
  });

  const path = ativacaoPath(token);
  const { simulado } = await getEmailService().enviarConvite({
    para: params.email,
    nome: row.nome,
    unidadeRotulo: row.unidadeRotulo,
    ativacaoPath: path,
    expiraEm: expiresAt.toISOString(),
  });

  return { convite: toApp(row), ativacaoPath: path, token, emailSimulado: simulado };
}

/** Nome do gestor autenticado para rastreabilidade (auditoria). */
async function nomeGestor(userId: string): Promise<string> {
  const gestor = await userRepository.findById(userId);
  return gestor?.name ?? "Gestor";
}

// --- Geração (gestor) --------------------------------------------------------

export interface GerarConviteInput {
  unidadeId?: string | null;
  unidadeRotulo: string;
  morador: MoradorInput;
}

export async function gerarConviteAction(input: GerarConviteInput): Promise<GerarConviteResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const erro = validarMorador(input.morador);
  if (erro) return { ok: false, error: erro };

  const email = normalizarEmail(input.morador.email);
  const unidadeId = input.unidadeId ?? null;

  // Evita convites duplicados em aberto para o mesmo e-mail+unidade.
  const emAberto = await conviteRepository.findAbertoByEmailUnidade(session.condominiumId, email, unidadeId);
  if (emAberto) {
    return {
      ok: false,
      error: "Já existe um convite pendente para este e-mail nesta unidade. Use 'Reenviar'.",
    };
  }

  try {
    const resultado = await criarEEnviarConvite({
      condominiumId: session.condominiumId,
      unidadeId,
      unidadeRotulo: input.unidadeRotulo,
      nome: input.morador.nome.trim(),
      email,
      telefone: input.morador.telefone?.trim() || null,
      vinculo: input.morador.vinculo,
      criadoPor: await nomeGestor(session.userId),
    });
    return { ok: true, resultado };
  } catch (e) {
    console.error("[SÍN-022] Falha ao gerar convite", e);
    return { ok: false, error: "Não foi possível gerar o convite. Tente novamente." };
  }
}

// --- Reenvio (gestor) --------------------------------------------------------

export async function reenviarConviteAction(id: string): Promise<ReenviarConviteResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const convite = await conviteRepository.findById(id, session.condominiumId);
  if (!convite) return { ok: false, error: "Convite não encontrado." };

  const view = statusConviteView({ status: convite.status, expiresAt: convite.expiresAt.toISOString() });
  if (!podeReenviar(view)) {
    return { ok: false, error: "Só é possível reenviar convites pendentes ou expirados." };
  }

  const { token, tokenHash } = gerarToken();
  const expiresAt = calcularExpiracao();

  const res = await conviteRepository.atualizarToken(id, session.condominiumId, tokenHash, expiresAt);
  if (res.count === 0) {
    return { ok: false, error: "Não foi possível reenviar o convite. Recarregue e tente novamente." };
  }

  const atualizado = await conviteRepository.findById(id, session.condominiumId);
  if (!atualizado) return { ok: false, error: "Convite não encontrado." };

  const path = ativacaoPath(token);
  const { simulado } = await getEmailService().enviarConvite({
    para: atualizado.email,
    nome: atualizado.nome,
    unidadeRotulo: atualizado.unidadeRotulo,
    ativacaoPath: path,
    expiraEm: expiresAt.toISOString(),
  });

  return {
    ok: true,
    resultado: { convite: toApp(atualizado), ativacaoPath: path, token, emailSimulado: simulado },
  };
}

// --- Revogação (gestor) ------------------------------------------------------

export async function revogarConviteAction(id: string): Promise<RevogarConviteResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const convite = await conviteRepository.findById(id, session.condominiumId);
  if (!convite) return { ok: false, error: "Convite não encontrado." };

  const view = statusConviteView({ status: convite.status, expiresAt: convite.expiresAt.toISOString() });
  if (!podeRevogar(view)) return { ok: false, error: "Este convite já está revogado." };

  const gestor = await userRepository.findById(session.userId);
  const revogadoPor = gestor?.name ?? "Gestor";

  await conviteRepository.marcarRevogado(id, session.condominiumId, revogadoPor);

  // Se o convite já resultou em um usuário, bloqueia o acesso dele (a flag
  // invalida sessões em curso e futuros logins — verificada no guard/login).
  if (convite.usuarioId) {
    try {
      await userRepository.setAcessoRevogado(convite.usuarioId, true);
      await registrarEventoSeguranca({
        tipo: "ACESSO_REVOGADO",
        resultado: "SUCESSO",
        userId: convite.usuarioId,
        condominiumId: session.condominiumId,
        recurso: "convites.revogarConvite",
        metadata: { revogadoPorUserId: session.userId, revogadoPorNome: revogadoPor },
      });
    } catch (e) {
      console.error("[SÍN-022] Falha ao bloquear usuário na revogação", e);
    }
  }

  const atualizado = await conviteRepository.findById(id, session.condominiumId);
  return atualizado
    ? { ok: true, convite: toApp(atualizado) }
    : { ok: false, error: "Não foi possível revogar o convite." };
}

// --- Troca de morador: venda (titularidade) e nova locação (Fase 2) ----------
//
// Fluxo (por unidade, escopo do condomínio):
//   1. atualiza o vínculo na unidade (proprietário na venda; inquilino na
//      locação) com os dados do novo morador;
//   2. REVOGA o acesso do morador anterior de mesmo vínculo (convites
//      pendentes/ativados) e bloqueia o usuário correspondente;
//   3. gera um novo convite de acesso para o novo morador (link copiável).
//
// Observação de integridade: seguimos o padrão do projeto (awaits sequenciais,
// sem transação cross-repo). A ordem garante segurança — o anterior é revogado
// antes de o novo assumir; se a etapa 3 falhar, o gestor apenas regenera o
// convite pelo botão normal, sem reexpor o acesso anterior.

export interface RegistrarTrocaInput {
  unidadeId: string;
  tipo: TipoTroca; // VENDA -> proprietário; LOCACAO -> inquilino
  novoMorador: { nome: string; email: string; telefone?: string };
}

export type RegistrarTrocaResult =
  | { ok: true; resultado: ConviteGerado; revogados: number; unidadeRotulo: string; anteriorNome: string | null }
  | { ok: false; error: string };

/** Revoga uma lista de convites (mesmo vínculo/unidade) e bloqueia seus usuários. */
async function revogarAnteriores(
  anteriores: { id: string; usuarioId: string | null }[],
  condominiumId: string,
  revogadoPor: string,
  executorUserId: string,
): Promise<void> {
  for (const c of anteriores) {
    await conviteRepository.marcarRevogado(c.id, condominiumId, revogadoPor);
    if (c.usuarioId) {
      try {
        await userRepository.setAcessoRevogado(c.usuarioId, true);
        await registrarEventoSeguranca({
          tipo: "ACESSO_REVOGADO",
          resultado: "SUCESSO",
          userId: c.usuarioId,
          condominiumId,
          recurso: "convites.revogarAnteriores",
          metadata: { revogadoPorUserId: executorUserId, revogadoPorNome: revogadoPor, motivo: "troca_morador" },
        });
      } catch (e) {
        console.error("[SÍN-022] Falha ao bloquear usuário anterior na troca", e);
      }
    }
  }
}

export async function registrarTrocaAction(input: RegistrarTrocaInput): Promise<RegistrarTrocaResult> {
  const session = await requireManager();
  if (!session.condominiumId) {
    return { ok: false, error: "Condomínio ativo não identificado na sessão." };
  }

  const vinculo = vinculoDaTroca(input.tipo);

  // Reusa a validação de morador com o vínculo derivado do tipo de troca.
  const erro = validarMorador({ ...input.novoMorador, vinculo });
  if (erro) return { ok: false, error: erro };

  const unidade = await unidadeRepository.findById(input.unidadeId, session.condominiumId);
  if (!unidade) return { ok: false, error: "Unidade não encontrada." };

  const rotulo = rotuloUnidade({ bloco: unidade.bloco ?? "", numero: unidade.numero });
  const nome = input.novoMorador.nome.trim();
  const email = normalizarEmail(input.novoMorador.email);
  const telefone = input.novoMorador.telefone?.trim() || null;
  const criadoPor = await nomeGestor(session.userId);

  // 1) Atualiza o vínculo na unidade (só os campos do vínculo afetado).
  const patch =
    input.tipo === "VENDA"
      ? { proprietarioNome: nome, proprietarioEmail: email, proprietarioTelefone: telefone }
      : { inquilinoNome: nome, inquilinoEmail: email, inquilinoTelefone: telefone };
  try {
    await unidadeRepository.update(input.unidadeId, session.condominiumId, patch);
  } catch (e) {
    console.error("[SÍN-022] Falha ao atualizar vínculo da unidade na troca", e);
    return { ok: false, error: "Não foi possível atualizar os dados da unidade." };
  }

  // 2) Revoga o acesso do morador anterior de mesmo vínculo.
  const anteriores = await conviteRepository.listAtivosByUnidadeVinculo(
    session.condominiumId,
    input.unidadeId,
    vinculo,
  );
  const anteriorNome = anteriores[0]?.nome ?? null;
  await revogarAnteriores(anteriores, session.condominiumId, criadoPor, session.userId);

  // 3) Gera o novo convite para o novo morador.
  let resultado: ConviteGerado;
  try {
    resultado = await criarEEnviarConvite({
      condominiumId: session.condominiumId,
      unidadeId: input.unidadeId,
      unidadeRotulo: rotulo,
      nome,
      email,
      telefone,
      vinculo,
      criadoPor,
    });
  } catch (e) {
    console.error("[SÍN-022] Falha ao gerar convite do novo morador na troca", e);
    return {
      ok: false,
      error: "O acesso anterior foi revogado, mas não foi possível gerar o novo convite. Gere-o manualmente em Gerenciar acessos.",
    };
  }

  return { ok: true, resultado, revogados: anteriores.length, unidadeRotulo: rotulo, anteriorNome };
}

// --- Consulta pública do convite (para a tela de ativação) -------------------

export type ConsultarConviteResult =
  | { ok: true; nome: string; unidadeRotulo: string; email: string }
  | { ok: false; motivo: MotivoAtivacaoInvalida | "nao_encontrado"; mensagem: string };

const NAO_ENCONTRADO = "Convite inválido. Verifique o link ou fale com o síndico.";

export async function consultarConviteAction(token: string): Promise<ConsultarConviteResult> {
  if (!token) return { ok: false, motivo: "nao_encontrado", mensagem: NAO_ENCONTRADO };

  const convite = await conviteRepository.findByTokenHash(hashToken(token));
  if (!convite) return { ok: false, motivo: "nao_encontrado", mensagem: NAO_ENCONTRADO };

  const validacao = validarAtivacao({
    status: convite.status,
    expiresAt: convite.expiresAt.toISOString(),
  });
  if (!validacao.ok) {
    return { ok: false, motivo: validacao.motivo, mensagem: MOTIVO_ATIVACAO_MENSAGEM[validacao.motivo] };
  }

  return { ok: true, nome: convite.nome, unidadeRotulo: convite.unidadeRotulo, email: convite.email };
}

// --- Ativação pública (morador define a própria senha) -----------------------

export type AtivarConviteResult =
  | { ok: true; nome: string }
  | { ok: false; error: string };

export async function ativarConviteAction(
  token: string,
  senha: string,
  confirmacao: string,
): Promise<AtivarConviteResult> {
  if (!token) return { ok: false, error: NAO_ENCONTRADO };

  const erroSenha = validarSenhaAtivacao(senha, confirmacao);
  if (erroSenha) return { ok: false, error: erroSenha };

  const convite = await conviteRepository.findByTokenHash(hashToken(token));
  if (!convite) return { ok: false, error: NAO_ENCONTRADO };

  // Revalida no servidor (uso único, expiração, revogação) — nunca confia no
  // cliente nem no que a tela de consulta mostrou antes.
  const validacao = validarAtivacao({
    status: convite.status,
    expiresAt: convite.expiresAt.toISOString(),
  });
  if (!validacao.ok) return { ok: false, error: MOTIVO_ATIVACAO_MENSAGEM[validacao.motivo] };

  const ativacao = await ativarAcessoMorador({
    email: convite.email,
    password: senha,
    name: convite.nome,
    unit: convite.unidadeRotulo,
    condominiumId: convite.condominiumId,
  });
  if (!ativacao.ok) return { ok: false, error: ativacao.error };

  // Uso único: transição atômica PENDENTE -> ATIVADO. Se outra requisição já
  // consumiu o convite (count === 0), a sessão recém-criada ainda é válida,
  // mas sinalizamos que o convite não pôde ser marcado.
  const marca = await conviteRepository.marcarAtivado(convite.id, ativacao.user.id);
  if (marca.count === 0) {
    console.warn("[SÍN-022] Convite consumido concorrentemente", convite.id);
  }

  return { ok: true, nome: ativacao.user.name };
}
