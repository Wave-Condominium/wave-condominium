// ---------------------------------------------------------------------------
// src/i18n/config.ts
//
// Configuração central de internacionalização (i18n) do Wave.
//
// Fonte única de verdade para: idiomas suportados, idioma padrão, rótulos do
// seletor e a chave de persistência. Para adicionar um novo idioma no futuro,
// basta: (1) incluir o código em LOCALES, (2) adicionar o rótulo em
// LOCALE_LABELS e (3) criar o dicionário em src/i18n/messages/<código>.ts e
// registrá-lo no I18nContext. Nenhuma refatoração estrutural é necessária.
// ---------------------------------------------------------------------------

export const LOCALES = ["pt-BR", "en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt-BR";

// Chave usada para persistir a preferência do usuário (localStorage).
export const STORAGE_KEY = "wave_locale";

// Rótulos exibidos no seletor de idioma.
export const LOCALE_LABELS: Record<Locale, { label: string; short: string }> = {
  "pt-BR": { label: "Português (Brasil)", short: "PT-BR" },
  en: { label: "English", short: "EN" },
  es: { label: "Español", short: "ES" },
};

// Type guard: garante que uma string é um Locale suportado.
export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
