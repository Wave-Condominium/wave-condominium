import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction, logoutAction, meAction, setActiveProfileAction } from "@/app/actions/auth";

export type AppRole = "Admin" | "Morador" | "Síndico" | "Conselho" | "Administradora";

export interface User {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  /** Perfis que o usuário pode assumir (SÍN-003). Único = [role]. */
  availableRoles: AppRole[];
  unit: string;
  walletAddress?: string;
  photoUrl?: string;
  mustChangePassword?: boolean;
}

function toUser(p: {
  id: string; email: string; name: string;
  role: User["role"]; availableRoles?: User["role"][];
  unit: string | null; photoUrl: string | null;
  mustChangePassword?: boolean;
}): User {
  return {
    id: p.id,
    email: p.email,
    name: p.name,
    role: p.role,
    availableRoles: p.availableRoles ?? [p.role],
    unit: p.unit ?? "",
    photoUrl: p.photoUrl ?? undefined,
    mustChangePassword: p.mustChangePassword ?? false,
  };
}

/** Destino pós-login/troca conforme o perfil ATIVO. */
function destinoPorPerfil(role: AppRole): string {
  return role === "Administradora" ? "/dashboard/administradora" : "/dashboard";
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // SÍN-003: quando o usuário tem mais de um perfil, o login cria a sessão com
  // o perfil primário mas NÃO redireciona — a UI oferece a escolha e só então
  // navega. `needsProfileChoice` segura esse estado intermediário.
  const [needsProfileChoice, setNeedsProfileChoice] = useState(false);
  const router = useRouter();

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const me = await meAction();
      setUser(me ? toUser(me) : null);
    } catch (error) {
      console.error("Auth check failed", error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email: string, password: string) {
    setLoading(true);
    try {
      const res = await loginAction(email, password);
      if (res.error) return { error: res.error, needsProfileChoice: false };
      const logged = res.user ? toUser(res.user) : null;
      setUser(logged);

      // Primeiro acesso: redireciona para troca obrigatória de senha
      // (precede a escolha de perfil — senha provisória bloqueia tudo).
      if (logged?.mustChangePassword) {
        setNeedsProfileChoice(false);
        router.push("/force-change-password");
        return { error: null, needsProfileChoice: false };
      }

      // Usuário com mais de um perfil: segura na tela de escolha, sem navegar.
      if (res.needsProfileChoice) {
        setNeedsProfileChoice(true);
        return { error: null, needsProfileChoice: true };
      }

      // Perfil único: fluxo atual — vai direto ao destino do perfil.
      setNeedsProfileChoice(false);
      if (logged) router.push(destinoPorPerfil(logged.role));
      return { error: null, needsProfileChoice: false };
    } catch (err) {
      console.error(err);
      return { error: { message: "Erro ao realizar login" }, needsProfileChoice: false };
    } finally {
      setLoading(false);
    }
  }

  // SÍN-003: define/alterna o perfil ATIVO da sessão. Serve tanto para a
  // escolha no login quanto para o "Trocar de perfil" dentro do app.
  async function setActiveProfile(role: AppRole) {
    setLoading(true);
    try {
      const res = await setActiveProfileAction(role);
      if (res.error) return { error: res.error };
      const atualizado = res.user ? toUser(res.user) : null;
      setUser(atualizado);
      setNeedsProfileChoice(false);
      if (atualizado) router.push(destinoPorPerfil(atualizado.role));
      return { error: null };
    } catch (err) {
      console.error(err);
      return { error: { message: "Erro ao trocar de perfil" } };
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await logoutAction();
    setUser(null);
    setNeedsProfileChoice(false);
    router.push("/login");
  }

  return {
    user,
    loading,
    login,
    logout,
    setActiveProfile,
    needsProfileChoice,
    isAuthenticated: !!user,
  };
}