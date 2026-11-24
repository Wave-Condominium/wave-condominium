'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { UserProvider } from '../contexts/UserContext';
import { I18nProvider } from '../contexts/I18nContext';
import { Toaster } from 'sonner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // NextThemesProvider aplica a classe `.dark` no <html> e persiste a
    // preferência (Claro/Escuro) em toda a plataforma. I18nProvider faz o
    // mesmo para o idioma. Ambos envolvem toda a aplicação.
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="wave_theme"
      disableTransitionOnChange
    >
      <I18nProvider>
        <UserProvider>
          <Toaster position="top-right" richColors />
          {children}
        </UserProvider>
      </I18nProvider>
    </NextThemesProvider>
  );
}
