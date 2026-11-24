'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useAuth, User, AppRole } from '@/hooks/useAuth';

// Mantendo compatibilidade com interfaces existentes onde possível
export interface UserProfile extends User {
  avatar?: string;
}

interface UserContextType {
  userProfile: UserProfile;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ error: any; needsProfileChoice?: boolean }>;
  logout: () => Promise<void>;
  // SÍN-003: escolher/alternar o perfil ativo (login dual e "Trocar de perfil").
  setActiveProfile: (role: AppRole) => Promise<{ error: any }>;
  needsProfileChoice: boolean;
  isLoading: boolean;
}

const defaultProfile: UserProfile = {
  id: '',
  name: '',
  unit: '',
  role: 'Morador', // Default válido
  availableRoles: ['Morador'],
  email: '',
  avatar: '',
  walletAddress: ''
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user, login, logout, loading, setActiveProfile, needsProfileChoice } = useAuth();

  // FIX: antes este campo era sempre sobrescrito com as iniciais do nome
  // (`avatar: getInitials(user.name)`), mas nada no app consumia essa string
  // — o Sidebar sempre calculou as próprias iniciais direto do nome. Ou
  // seja, era código morto. Agora `avatar` carrega a foto de perfil real
  // (quando existir), e cada componente decide seu próprio fallback visual.
  const userProfile: UserProfile = user ? {
    ...user,
    avatar: user.photoUrl
  } : defaultProfile;

  return (
    <UserContext.Provider value={{
      userProfile,
      isAuthenticated: !!user,
      login,
      logout,
      setActiveProfile,
      needsProfileChoice,
      isLoading: loading
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
