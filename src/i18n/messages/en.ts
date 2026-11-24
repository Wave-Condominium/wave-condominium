// ---------------------------------------------------------------------------
// src/i18n/messages/en.ts — English dictionary.
// Deve seguir exatamente a mesma estrutura de chaves de pt-BR.ts (garantido
// pelo tipo Messages).
// ---------------------------------------------------------------------------

import type { Messages } from "./pt-BR";

const en: Messages = {
  login: {
    hero: {
      titlePrefix: "Condominium governance with",
      titleHighlight: "proof of integrity",
      subtitle:
        "Every decision recorded, every vote auditable, and all documents protected.",
      features: {
        governanca: {
          label: "Governance",
          desc: "Voting with an immutable record",
        },
        documentos: {
          label: "Documents",
          desc: "Minutes with a verifiable record",
        },
        transparencia: {
          label: "Transparency",
          desc: "Auditable by any resident",
        },
      },
      footer: "© 2026 Wave · Smart Condominium Management",
    },
    badge: "Welcome back",
    title: "Access the platform",
    emailLabel: "Email",
    emailPlaceholder: "you@email.com",
    passwordLabel: "Password",
    remember: "Remember me",
    forgot: "Forgot my password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    back: "Back",
    demo: {
      sindico: "Manager",
      morador: "Resident",
      administradora: "Administrator",
    },
    chooseProfile: {
      title: "How would you like to sign in?",
      subtitle: "Your account has more than one profile. Choose which one to use now.",
      enterAs: "Sign in as",
      switchError: "Could not switch profile. Please try again.",
    },
    errors: {
      fillFields: "Please enter your email and password",
      invalidCredentials: "Please check your credentials.",
      unexpected: "Unexpected error while signing in.",
    },
  },
  language: {
    selectorLabel: "Select language",
  },
};

export default en;
