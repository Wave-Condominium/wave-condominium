// ---------------------------------------------------------------------------
// SEG-016 (Eventos de Segurança) — Fase 1: estrutura + eventos de auth.
//
// Módulo PURO (sem Prisma) — a lógica testável não deve puxar a cadeia de
// servidor no ambiente de testes, mesmo padrão de
// src/components/boletos/boletoStatus.ts (SÍN-011).
// ---------------------------------------------------------------------------

export type TipoEventoSeguranca =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  | "LOGOUT"
  | "ACESSO_NEGADO"
  | "SENHA_ALTERADA"
  | "ACESSO_REVOGADO"
  | "ACESSO_RESTAURADO"
  | "PERFIL_ALTERADO"
  | "ASSINATURA_EMISSORA_SUCESSO"
  | "ASSINATURA_EMISSORA_FALHA";

export type ResultadoEvento = "SUCESSO" | "FALHA";

export const TIPO_EVENTO_LABEL: Record<TipoEventoSeguranca, string> = {
  LOGIN_SUCESSO: "Login realizado",
  LOGIN_FALHA: "Falha de login",
  LOGOUT: "Logout",
  ACESSO_NEGADO: "Tentativa de acesso negada",
  SENHA_ALTERADA: "Senha alterada",
  ACESSO_REVOGADO: "Acesso revogado",
  ACESSO_RESTAURADO: "Acesso restaurado",
  PERFIL_ALTERADO: "Perfil ativo alterado",
  ASSINATURA_EMISSORA_SUCESSO: "Assinatura da conta emissora realizada",
  ASSINATURA_EMISSORA_FALHA: "Falha na assinatura da conta emissora",
};

// Eventos cujo resultado é sempre o mesmo (não faz sentido, por exemplo, um
// "logout" com resultado FALHA) — usado para validar a entrada antes de
// gravar, evitando dado inconsistente na trilha de segurança.
const RESULTADO_FIXO: Partial<Record<TipoEventoSeguranca, ResultadoEvento>> = {
  LOGIN_SUCESSO: "SUCESSO",
  LOGIN_FALHA: "FALHA",
  LOGOUT: "SUCESSO",
  SENHA_ALTERADA: "SUCESSO",
  ACESSO_REVOGADO: "SUCESSO",
  ACESSO_RESTAURADO: "SUCESSO",
  ACESSO_NEGADO: "FALHA",
  PERFIL_ALTERADO: "SUCESSO",
  ASSINATURA_EMISSORA_SUCESSO: "SUCESSO",
  ASSINATURA_EMISSORA_FALHA: "FALHA",
};

export function validarResultado(
  tipo: TipoEventoSeguranca,
  resultado: ResultadoEvento
): boolean {
  const fixo = RESULTADO_FIXO[tipo];
  return fixo === undefined || fixo === resultado;
}

// ---------------------------------------------------------------------------
// Retenção (SEG-016 Fase 2) — decisão confirmada com o Robson: 12 meses.
// Depois disso, eventos são expurgados (não arquivados) — ver o cron em
// src/app/api/cron/purge-eventos-seguranca/route.ts, que roda diariamente.
// ---------------------------------------------------------------------------

export const RETENCAO_DIAS = 365;

/** Data de corte: eventos com timestamp ANTES disso podem ser expurgados. */
export function calcularDataCorte(agora: Date): Date {
  const corte = new Date(agora);
  corte.setDate(corte.getDate() - RETENCAO_DIAS);
  return corte;
}

// ---------------------------------------------------------------------------
// Escopo de consulta — quem pode ver o quê.
//
// Decisão confirmada com o Robson: Admin de plataforma vê TODOS os
// condomínios; Síndico vê só os eventos do PRÓPRIO condomínio ativo;
// Administradora vê os eventos de TODOS OS CONDOMÍNIOS QUE ELA GERE (não a
// plataforma inteira) — resolvido via `Condominium.administradoraId`, a
// mesma modelagem já usada no painel dela (SÍN-031). Qualquer outro papel
// (Morador, Conselho) é negado.
//
// A resolução de QUAIS condomínios uma Administradora gere depende do banco
// (não é pura) — por isso o tipo "ADMINISTRADORA" carrega só o
// `administradoraId`; é o repository (eventoSegurancaRepository) quem busca
// a lista de condomínios e monta o filtro final.
// ---------------------------------------------------------------------------

export type EscopoConsultaEventos =
  | { tipo: "TODOS" }
  | { tipo: "CONDOMINIO"; condominiumId: string }
  | { tipo: "ADMINISTRADORA"; administradoraId: string }
  | { tipo: "NEGADO" };

export interface SessaoParaEscopo {
  role: string;
  condominiumId: string | null;
  administradoraId?: string | null;
}

export function resolverEscopoConsulta(
  sessao: SessaoParaEscopo
): EscopoConsultaEventos {
  if (sessao.role === "Admin") return { tipo: "TODOS" };
  if (sessao.role === "Síndico") {
    if (!sessao.condominiumId) return { tipo: "NEGADO" };
    return { tipo: "CONDOMINIO", condominiumId: sessao.condominiumId };
  }
  if (sessao.role === "Administradora") {
    if (!sessao.administradoraId) return { tipo: "NEGADO" };
    return { tipo: "ADMINISTRADORA", administradoraId: sessao.administradoraId };
  }
  return { tipo: "NEGADO" };
}
