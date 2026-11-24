'use client';

import { Login } from '@/components/Login';
import { useUser } from '@/contexts/UserContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { hasPendingPasswordReset } from '@/lib/passwordReset';

export default function LoginPage() {
  const { login, isAuthenticated, isLoading, userProfile, setActiveProfile, needsProfileChoice } = useUser();
  const router = useRouter();

  useEffect(() => {
    // Só redireciona após o carregamento inicial terminar
    // Evita piscar o dashboard antes de confirmar sessão.
    // SÍN-003: se o usuário ainda precisa escolher o perfil (dual), segura o
    // redirect até a escolha — a sessão já existe com o perfil primário.
    if (!isLoading && isAuthenticated && !needsProfileChoice) {
      // Se este e-mail tem uma redefinição de senha pendente (veio do fluxo
      // "Esqueci minha senha"), manda para /reset-password em vez do
      // dashboard normal. Ver src/lib/passwordReset.ts para detalhes e
      // limitações conhecidas dessa checagem.
      if (userProfile.email && hasPendingPasswordReset(userProfile.email)) {
        router.push('/reset-password');
      } else {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, isLoading, userProfile, needsProfileChoice, router]);

  // Enquanto carrega, não exibe nada para evitar flash da tela de login
  if (isLoading) return null;

  // Se já autenticado E sem escolha de perfil pendente, aguarda o redirect.
  // Quando há escolha pendente (dual), mantém a tela para exibir o seletor.
  if (isAuthenticated && !needsProfileChoice) return null;

  return (
    <Login
      onLogin={login}
      onChooseProfile={setActiveProfile}
      needsProfileChoice={needsProfileChoice}
      availableRoles={userProfile.availableRoles}
    />
  );
}
