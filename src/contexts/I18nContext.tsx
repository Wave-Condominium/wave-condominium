"use client";

// ---------------------------------------------------------------------------
// src/contexts/I18nContext.tsx
//
// Provedor de internacionalização (i18n) do Wave.
//
// - Expõe `locale`, `setLocale` e `t(chave)` para toda a aplicação.
// - Persiste a preferência do usuário em localStorage (chave STORAGE_KEY).
// - Idioma padrão: Português (Brasil) quando não há preferência salva.
//
// A tradução é feita por dicionários (src/i18n/messages/*), sem textos fixos
// espalhados pelos componentes. Para adicionar um idioma, registre-o em DICTS.
// ---------------------------------------------------------------------------

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_LOCALE,
  STORAGE_KEY,
  isLocale,
  type Locale,
} from "@/i18n/config";
import ptBR, { type Messages } from "@/i18n/messages/pt-BR";
import en from "@/i18n/messages/en";
import es from "@/i18n/messages/es";

const DICTS: Record<Locale, Messages> = {
  "pt-BR": ptBR,
  en,
  es,
};

// Resolve uma chave com notação de ponto (ex.: "login.badge") no dicionário.
// Se não encontrar, devolve a própria chave (evita quebrar a tela).
function resolve(dict: Messages, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      dict,
    );
  return typeof value === "string" ? value : path;
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Ao montar no cliente, lê a preferência salva (se houver).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(saved)) {
        setLocaleState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      /* localStorage indisponível — mantém o padrão. */
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.lang = next;
    } catch {
      /* ignora ambiente sem localStorage */
    }
  }, []);

  const t = useCallback(
    (key: string) => resolve(DICTS[locale] ?? ptBR, key),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n deve ser usado dentro de <I18nProvider>.");
  }
  return ctx;
}
