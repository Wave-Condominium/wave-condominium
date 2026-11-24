import { eventoSegurancaRepository } from "@/server/repositories/eventoSegurancaRepository";
import { alertaSegurancaRepository } from "@/server/repositories/alertaSegurancaRepository";
import {
  buscarRegra,
  deveDispararAlerta,
  dentroDoCooldown,
  descreverAlerta,
} from "@/server/security/anomalia";

export interface ContextoDeteccao {
  tipoEvento: "LOGIN_FALHA" | "ACESSO_NEGADO";
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  condominiumId?: string | null;
}

/**
 * Avalia as regras de anomalia aplicáveis ao evento que ACABOU de ser
 * registrado. NUNCA lança — mesma filosofia de registrarEventoSeguranca: uma
 * falha na detecção não pode atrapalhar login/guards. Erros vão só para o
 * console do servidor.
 */
export async function avaliarAnomalias(ctx: ContextoDeteccao): Promise<void> {
  try {
    const agora = new Date();

    if (ctx.tipoEvento === "LOGIN_FALHA" && ctx.email) {
      await avaliarFalhasMesmaConta(ctx, agora);
    }
    if (ctx.tipoEvento === "LOGIN_FALHA" && ctx.ip) {
      await avaliarContasDistintasPorIp(ctx, agora);
    }
    if (ctx.tipoEvento === "ACESSO_NEGADO" && ctx.userId) {
      await avaliarAcessosNegados(ctx, agora);
    }
  } catch (err) {
    console.error("[detectarAnomalias] falha ao avaliar regras", err);
  }
}

async function avaliarFalhasMesmaConta(ctx: ContextoDeteccao, agora: Date): Promise<void> {
  const regra = buscarRegra("MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA");
  const desde = new Date(agora.getTime() - regra.janelaMinutos * 60_000);
  const contagem = await eventoSegurancaRepository.contarFalhasLoginPorEmail(ctx.email!, desde);
  if (!deveDispararAlerta(contagem, regra)) return;

  const ultimo = await alertaSegurancaRepository.buscarUltimoAberto({
    tipo: regra.tipo,
    email: ctx.email,
  });
  if (dentroDoCooldown(ultimo?.createdAt ?? null, agora, regra)) return;

  await alertaSegurancaRepository.criar({
    tipo: regra.tipo,
    descricao: descreverAlerta(regra.tipo, contagem, regra.janelaMinutos),
    contagem,
    userId: ctx.userId ?? null,
    email: ctx.email,
    condominiumId: ctx.condominiumId ?? null,
    ip: ctx.ip ?? null,
  });
}

async function avaliarContasDistintasPorIp(ctx: ContextoDeteccao, agora: Date): Promise<void> {
  const regra = buscarRegra("MULTIPLOS_LOGINS_MESMO_IP");
  const desde = new Date(agora.getTime() - regra.janelaMinutos * 60_000);
  const contagem = await eventoSegurancaRepository.contarEmailsDistintosPorIpFalhaLogin(
    ctx.ip!,
    desde
  );
  if (!deveDispararAlerta(contagem, regra)) return;

  // Chave do cooldown é o IP (não o e-mail — o alerta é sobre o IP suspeito,
  // não sobre uma conta específica).
  const ultimo = await alertaSegurancaRepository.buscarUltimoAberto({
    tipo: regra.tipo,
    ip: ctx.ip,
  });
  if (dentroDoCooldown(ultimo?.createdAt ?? null, agora, regra)) return;

  await alertaSegurancaRepository.criar({
    tipo: regra.tipo,
    descricao: descreverAlerta(regra.tipo, contagem, regra.janelaMinutos),
    contagem,
    userId: null,
    email: null,
    condominiumId: ctx.condominiumId ?? null,
    ip: ctx.ip,
  });
}

async function avaliarAcessosNegados(ctx: ContextoDeteccao, agora: Date): Promise<void> {
  const regra = buscarRegra("MUITOS_ACESSOS_NEGADOS");
  const desde = new Date(agora.getTime() - regra.janelaMinutos * 60_000);
  const contagem = await eventoSegurancaRepository.contarAcessosNegadosPorUsuario(
    ctx.userId!,
    desde
  );
  if (!deveDispararAlerta(contagem, regra)) return;

  const ultimo = await alertaSegurancaRepository.buscarUltimoAberto({
    tipo: regra.tipo,
    userId: ctx.userId,
  });
  if (dentroDoCooldown(ultimo?.createdAt ?? null, agora, regra)) return;

  await alertaSegurancaRepository.criar({
    tipo: regra.tipo,
    descricao: descreverAlerta(regra.tipo, contagem, regra.janelaMinutos),
    contagem,
    userId: ctx.userId,
    email: ctx.email ?? null,
    condominiumId: ctx.condominiumId ?? null,
    ip: ctx.ip ?? null,
  });
}
