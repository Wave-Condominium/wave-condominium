// ---------------------------------------------------------------------------
// src/server/access/email.ts
//
// Serviço de e-mail (SÍN-022) — ABSTRAÇÃO da entrega do convite de acesso.
//
// Nesta fase NÃO há provedor de e-mail real: a entrega é SIMULADA (registrada
// no log do servidor) e o link de ativação é devolvido para a UI exibir de
// forma copiável. A interface `EmailService` isola o resto do sistema do meio
// de entrega — quando um provedor real (SES, Resend, SMTP...) for configurado,
// basta trocar a implementação sem tocar nas Server Actions.
//
// IMPORTANTE: o link contém o token em claro. Ele NUNCA é persistido nem
// logado integralmente em produção — aqui, por ser ambiente simulado, o log é
// aceitável e explícito.
// ---------------------------------------------------------------------------

export interface ConviteEmailPayload {
  para: string;
  nome: string;
  unidadeRotulo: string;
  /** Caminho relativo de ativação (a UI compõe a origem). */
  ativacaoPath: string;
  /** Expiração legível (ISO). */
  expiraEm: string;
}

export interface EmailEnvioResultado {
  /** Verdadeiro quando a entrega foi apenas simulada (sem provedor real). */
  simulado: boolean;
}

export interface EmailService {
  enviarConvite(payload: ConviteEmailPayload): Promise<EmailEnvioResultado>;
}

// Implementação simulada (default nesta fase).
const simulatedEmailService: EmailService = {
  async enviarConvite(payload) {
    // Log estruturado e enxuto — sem despejar o token inteiro.
    console.info(
      "[SÍN-022] Convite de acesso (simulado):",
      JSON.stringify({
        para: payload.para,
        nome: payload.nome,
        unidade: payload.unidadeRotulo,
        expiraEm: payload.expiraEm,
      }),
    );
    return { simulado: true };
  },
};

/**
 * Ponto único de obtenção do serviço de e-mail. Hoje retorna a implementação
 * simulada; no futuro pode decidir pelo provedor real conforme configuração.
 */
export function getEmailService(): EmailService {
  return simulatedEmailService;
}
