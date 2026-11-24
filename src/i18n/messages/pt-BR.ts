// ---------------------------------------------------------------------------
// src/i18n/messages/pt-BR.ts
//
// Dicionário de textos em Português (Brasil) — idioma padrão e "fonte da
// verdade" da estrutura de mensagens. O tipo `Messages` é derivado deste
// arquivo; os demais idiomas (en, es) devem seguir exatamente as mesmas chaves.
// ---------------------------------------------------------------------------

const ptBR = {
  login: {
    hero: {
      titlePrefix: "Governança condominial com",
      titleHighlight: "prova de integridade",
      subtitle:
        "Cada decisão registrada, cada voto auditável e todos os documentos protegidos.",
      features: {
        governanca: {
          label: "Governança",
          desc: "Votações com registro imutável",
        },
        documentos: {
          label: "Documentos",
          desc: "Atas com registro verificável",
        },
        transparencia: {
          label: "Transparência",
          desc: "Auditável por qualquer morador",
        },
      },
      footer: "© 2026 Wave · Gestão Condominial Inteligente",
    },
    badge: "Bem Vindo(a) de volta",
    title: "Acessar plataforma",
    emailLabel: "E-mail",
    emailPlaceholder: "seu@email.com",
    passwordLabel: "Senha",
    remember: "Lembrar-me",
    forgot: "Esqueci minha senha",
    signIn: "Entrar",
    signingIn: "Entrando...",
    back: "Voltar",
    demo: {
      sindico: "Síndico",
      morador: "Morador",
      administradora: "Administradora",
    },
    chooseProfile: {
      title: "Como deseja entrar?",
      subtitle: "Sua conta tem mais de um perfil. Escolha com qual acessar agora.",
      enterAs: "Entrar como",
      switchError: "Não foi possível trocar de perfil. Tente novamente.",
    },
    errors: {
      fillFields: "Por favor, preencha email e senha",
      invalidCredentials: "Verifique suas credenciais.",
      unexpected: "Erro inesperado ao fazer login.",
    },
  },
  language: {
    selectorLabel: "Selecionar idioma",
  },
};

export type Messages = typeof ptBR;
export default ptBR;
