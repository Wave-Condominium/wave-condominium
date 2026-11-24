"use server";

import { requireSession, AuthError } from "@/server/auth/guard";
import { alertaSegurancaRepository } from "@/server/repositories/alertaSegurancaRepository";
import { registrarEventoSeguranca } from "@/server/security/registrarEventoSeguranca";
import {
  resolverEscopoConsulta,
  type TipoEventoSeguranca,
} from "@/server/security/eventoSeguranca";
import { ALERTA_LABEL, type TipoAlertaSeguranca } from "@/server/security/anomalia";

export interface AlertaSegurancaView {
  id: string;
  tipo: TipoAlertaSeguranca;
  tipoLabel: string;
  descricao: string;
  contagem: number;
  createdAt: string;
  email: string | null;
  ip: string | null;
  condominiumId: string | null;
  resolvidoEm: string | null;
}

export type ListarAlertasSegurancaResult =
  | { ok: true; itens: AlertaSegurancaView[]; total: number; page: number; pageSize: number }
  | { ok: false; error: string };

async function resolverEscopoOuNegar(): Promise<
  | { ok: true; escopo: Exclude<ReturnType<typeof resolverEscopoConsulta>, { tipo: "NEGADO" }>; sessionUserId: string }
  | { ok: false; error: string }
> {
  const session = await requireSession();
  const escopo = resolverEscopoConsulta({
    role: session.role,
    condominiumId: session.condominiumId ?? null,
    administradoraId: session.administradoraId ?? null,
  });
  if (escopo.tipo === "NEGADO") {
    await registrarEventoSeguranca({
      tipo: "ACESSO_NEGADO" as TipoEventoSeguranca,
      resultado: "FALHA",
      userId: session.userId,
      condominiumId: session.condominiumId ?? null,
      recurso: "alertasSeguranca.consulta",
    });
    return { ok: false, error: "Sem permissão para consultar alertas de segurança." };
  }
  return { ok: true, escopo, sessionUserId: session.userId };
}

/** Consulta os alertas (mesmo RBAC dos eventos — ver resolverEscopoConsulta). */
export async function listarAlertasSegurancaAction(
  page = 1,
  apenasAbertos = false
): Promise<ListarAlertasSegurancaResult> {
  try {
    const resolvido = await resolverEscopoOuNegar();
    if (!resolvido.ok) return resolvido;

    const { itens, total, pageSize } = await alertaSegurancaRepository.listar({
      escopo: resolvido.escopo,
      apenasAbertos,
      page,
    });

    return {
      ok: true,
      total,
      page,
      pageSize,
      itens: itens.map((a) => ({
        id: a.id,
        tipo: a.tipo as unknown as TipoAlertaSeguranca,
        tipoLabel: ALERTA_LABEL[a.tipo as unknown as TipoAlertaSeguranca],
        descricao: a.descricao,
        contagem: a.contagem,
        createdAt: a.createdAt.toISOString(),
        email: a.email,
        ip: a.ip,
        condominiumId: a.condominiumId,
        resolvidoEm: a.resolvidoEm ? a.resolvidoEm.toISOString() : null,
      })),
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Sessão inválida. Faça login novamente." };
    }
    console.error("[listarAlertasSegurancaAction]", err);
    return { ok: false, error: "Erro inesperado ao consultar alertas de segurança." };
  }
}

/** Contagem de alertas abertos — alimenta o badge no menu (SÍN-026, mesmo padrão). */
export async function contarAlertasAbertosAction(): Promise<number> {
  try {
    const resolvido = await resolverEscopoOuNegar();
    if (!resolvido.ok) return 0;
    return await alertaSegurancaRepository.contarAbertos(resolvido.escopo);
  } catch {
    return 0;
  }
}

export type ResolverAlertaResult = { ok: true } | { ok: false; error: string };

/** Marca um alerta como resolvido/visto. Nunca exclui (histórico preservado). */
export async function resolverAlertaAction(id: string): Promise<ResolverAlertaResult> {
  try {
    const resolvido = await resolverEscopoOuNegar();
    if (!resolvido.ok) return resolvido;
    await alertaSegurancaRepository.resolver(id, resolvido.sessionUserId);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Sessão inválida. Faça login novamente." };
    }
    console.error("[resolverAlertaAction]", err);
    return { ok: false, error: "Erro ao marcar o alerta como resolvido." };
  }
}
