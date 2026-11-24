"use client";

// ---------------------------------------------------------------------------
// src/components/LanguageSelector.tsx
//
// Seletor de idioma reutilizável (usado na tela de Login e disponível para
// qualquer outra tela). Mostra o código curto do idioma atual (ex.: PT-BR) e,
// ao abrir, lista os idiomas disponíveis. Persistência e troca ficam a cargo
// do I18nContext. Feito para funcionar em desktop e mobile (áreas de toque
// generosas e fechamento por clique fora).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";

import { useI18n } from "@/contexts/I18nContext";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";

export function LanguageSelector({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("language.selectorLabel")}
        className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[40px] max-w-[45vw] rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm leading-none whitespace-nowrap backdrop-blur-sm transition-colors"
      >
        <Globe className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="font-medium truncate">{LOCALE_LABELS[locale].short}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          {/* Camada para fechar ao clicar fora (funciona também no toque). */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <ul
            role="listbox"
            aria-label={t("language.selectorLabel")}
            className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-1.5rem)] z-20 bg-white rounded-xl shadow-2xl border border-brand-chrome/30 overflow-hidden py-1"
          >
            {LOCALES.map((l) => {
              const active = l === locale;
              return (
                <li key={l} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => {
                      setLocale(l);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 min-h-[44px] text-left text-sm hover:bg-brand-light transition-colors ${
                      active ? "text-brand-navy font-medium" : "text-brand-grey"
                    }`}
                  >
                    <span className="truncate">{LOCALE_LABELS[l].label}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-brand-grey/70">
                        {LOCALE_LABELS[l].short}
                      </span>
                      {active && (
                        <Check
                          className="w-4 h-4 text-brand-teal"
                          aria-hidden="true"
                        />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
