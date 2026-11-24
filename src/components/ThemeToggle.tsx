"use client";

// ---------------------------------------------------------------------------
// src/components/ThemeToggle.tsx
//
// Controle de tema Claro/Escuro. Usa o next-themes (já dependência do projeto):
// - troca imediata (sem recarregar a página);
// - persistência automática em localStorage (storageKey "wave_theme");
// - aplica a classe `.dark` no <html>, valendo para toda a plataforma.
//
// O visual escuro de cada tela é aplicado de forma incremental via variantes
// `dark:` do Tailwind (os tokens .dark já existem em globals.css).
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes só conhece o tema no cliente; evita divergência de hidratação.
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = !mounted
    ? "Alternar tema"
    : isDark
      ? "Tema claro"
      : "Tema escuro";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={label}
      title={label}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-wave-400 hover:bg-wave-50 hover:text-wave-600 transition-all ${className}`}
    >
      {isDark ? (
        <Sun className="w-4 h-4 shrink-0" aria-hidden="true" />
      ) : (
        <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
