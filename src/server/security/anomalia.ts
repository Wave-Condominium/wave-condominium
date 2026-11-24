// ---------------------------------------------------------------------------
// SEG-016 (Eventos de Segurança) — Fase 2: detecção de anomalias.
//
// Regras DETERMINÍSTICAS e configuráveis (sem IA/ML nesta fase — o card pede
// explicitamente "evitar modelos complexos... priorizar regras
// determinísticas, limites configuráveis e alertas rastreáveis").
//
// Escopo desta fase: só as regras que os eventos JÁ INSTRUMENTADOS na Fase 1
// permitem calcular (LOGIN_FALHA, ACESSO_NEGADO). Regras sobre exportação de
// dados ou acesso fora de hora ficam para quando essas fontes existirem.
//
// Módulo PURO (sem Prisma) — mesmo padrão de eventoSeguranca.ts.
// ---------------------------------------------------------------------------

export type TipoAlertaSeguranca =
  | "MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA"
  | "MULTIPLOS_LOGINS_MESMO_IP"
  | "MUITOS_ACESSOS_NEGADOS";

export const ALERTA_LABEL: Record<TipoAlertaSeguranca, string> = {
  MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA: "Várias falhas de login na mesma conta",
  MULTIPLOS_LOGINS_MESMO_IP: "Vários logins de contas diferentes no mesmo IP",
  MUITOS_ACESSOS_NEGADOS: "Muitas tentativas de acesso negadas",
};

export interface RegraAnomalia {
  tipo: TipoAlertaSeguranca;
  /** A partir de quantas ocorrências a regra dispara. */
  limite: number;
  /** Janela de tempo (minutos) em que as ocorrências são contadas. */
  janelaMinutos: number;
  /**
   * Depois de disparar, por quanto tempo (minutos) a regra fica "em
   * cooldown" — evita um alerta novo a cada evento subsequente enquanto o
   * primeiro ainda não foi resolvido/investigado.
   */
  cooldownMinutos: number;
}

// Limites iniciais — configuráveis (o card pede isso explicitamente).
// Ajustar aqui não exige mudança de schema nem de lógica de detecção.
export const REGRAS_ANOMALIA: RegraAnomalia[] = [
  {
    tipo: "MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA",
    limite: 5,
    janelaMinutos: 15,
    cooldownMinutos: 30,
  },
  {
    tipo: "MULTIPLOS_LOGINS_MESMO_IP",
    limite: 3,
    janelaMinutos: 10,
    cooldownMinutos: 30,
  },
  {
    tipo: "MUITOS_ACESSOS_NEGADOS",
    limite: 10,
    janelaMinutos: 30,
    cooldownMinutos: 60,
  },
];

export function buscarRegra(tipo: TipoAlertaSeguranca): RegraAnomalia {
  const regra = REGRAS_ANOMALIA.find((r) => r.tipo === tipo);
  if (!regra) throw new Error(`Regra de anomalia não encontrada: ${tipo}`);
  return regra;
}

export function deveDispararAlerta(contagem: number, regra: RegraAnomalia): boolean {
  return contagem >= regra.limite;
}

export function dentroDoCooldown(
  ultimoAlertaEm: Date | null,
  agora: Date,
  regra: RegraAnomalia
): boolean {
  if (!ultimoAlertaEm) return false;
  const diffMs = agora.getTime() - ultimoAlertaEm.getTime();
  return diffMs < regra.cooldownMinutos * 60 * 1000;
}

export function descreverAlerta(
  tipo: TipoAlertaSeguranca,
  contagem: number,
  janelaMinutos: number
): string {
  switch (tipo) {
    case "MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA":
      return `${contagem} falhas de login na mesma conta em ${janelaMinutos} minutos.`;
    case "MULTIPLOS_LOGINS_MESMO_IP":
      return `${contagem} contas diferentes tentaram login pelo mesmo IP em ${janelaMinutos} minutos.`;
    case "MUITOS_ACESSOS_NEGADOS":
      return `${contagem} tentativas de acesso negadas em ${janelaMinutos} minutos.`;
  }
}
