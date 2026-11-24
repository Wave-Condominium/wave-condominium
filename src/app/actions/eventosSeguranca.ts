"use server";

import { requireSession, AuthError } from "@/server/auth/guard";
import { eventoSegurancaRepository } from "@/server/repositories/eventoSegurancaRepository";
import { registrarEventoSeguranca } from "@/server/security/registrarEventoSeguranca";
import {
  resolverEscopoConsulta,
  TIPO_EVENTO_LABEL,
  type TipoEventoSeguranca,
} from "@/server/security/eventoSeguranca";

export interface EventoSegurancaView {
  id: string;
  tipo: TipoEventoSeguranca;
  tipoLabel: string;
  resultado: "SUCESSO" | "FALHA";
  timestamp: string;
  userId: string | null;
  email: string | null;
  condominiumId: string | null;
  ip: string | null;
  userAgent: string | null;
  recurso: string | null;
}

export type ListarEventosSegurancaResult =
  | { ok: true; itens: EventoSegurancaView[]; total: number; page: number; pageSize: number }
  | { ok: false; error: string };

/**
 * Consulta os eventos de segurança. RBAC aplicado no servidor via
 * resolverEscopoConsulta (módulo puro, testado): Admin de plataforma vê
 * tudo; Síndico vê só o próprio condomínio ativo; qualquer outro papel
 * (Morador, Conselho, Administradora — não decidido ainda) é negado, e a
 * própria tentativa vira um evento ACESSO_NEGADO (é exatamente o tipo de
 * comportamento que este card existe para detectar).
 */
export async function listarEventosSegurancaAction(
  page = 1
): Promise<ListarEventosSegurancaResult> {
  try {
    const session = await requireSession();
    const escopo = resolverEscopoConsulta({
      role: session.role,
      condominiumId: session.condominiumId ?? null,
      administradoraId: session.administradoraId ?? null,
    });

    if (escopo.tipo === "NEGADO") {
      await registrarEventoSeguranca({
        tipo: "ACESSO_NEGADO",
        resultado: "FALHA",
        userId: session.userId,
        condominiumId: session.condominiumId ?? null,
        recurso: "eventosSeguranca.listar",
      });
      return { ok: false, error: "Sem permissão para consultar eventos de segurança." };
    }

    const { itens, total, pageSize } = await eventoSegurancaRepository.listar({
      escopo,
      page,
    });

    return {
      ok: true,
      total,
      page,
      pageSize,
      itens: itens.map((e) => ({
        id: e.id,
        tipo: e.tipo as unknown as TipoEventoSeguranca,
        tipoLabel: TIPO_EVENTO_LABEL[e.tipo as unknown as TipoEventoSeguranca],
        resultado: e.resultado as unknown as "SUCESSO" | "FALHA",
        timestamp: e.timestamp.toISOString(),
        userId: e.userId,
        email: e.email,
        condominiumId: e.condominiumId,
        ip: e.ip,
        userAgent: e.userAgent,
        recurso: e.recurso,
      })),
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return { ok: false, error: "Sessão inválida. Faça login novamente." };
    }
    console.error("[listarEventosSegurancaAction]", err);
    return { ok: false, error: "Erro inesperado ao consultar eventos de segurança." };
  }
}
