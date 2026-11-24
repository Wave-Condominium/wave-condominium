'use client';

import { useEffect, useState } from 'react';
import { Menu, Building2, ChevronLeft } from 'lucide-react';
import { Sidebar } from '@/components/Sidebar';
import { CondominioSwitcher } from '@/components/CondominioSwitcher';
import { useUser } from '@/contexts/UserContext';
import { PendenciasProvider } from '@/contexts/PendenciasContext';
import { AlertasSegurancaProvider } from '@/contexts/AlertasSegurancaContext';
import { useRouter, usePathname } from 'next/navigation';
import {
  contextoAdministradoraAction,
  sairDoCondominioAction,
} from '@/app/actions/administradora';

const PAINEL_ADM = '/dashboard/administradora';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userProfile, isAuthenticated, isLoading, logout, setActiveProfile } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Condominio ativo da Administradora (vem da sessao no servidor).
  const [condAtivo, setCondAtivo] = useState<{ id: string | null; nome: string | null } | null>(null);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    // Só redireciona ao login após confirmar que não há sessão ativa
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Administradora: descobre o condominio ativo e, se nao houver, leva ao painel.
  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    if (userProfile.role !== 'Administradora') return;

    let ativo = true;
    contextoAdministradoraAction()
      .then((ctx) => {
        if (!ativo) return;
        setCondAtivo({ id: ctx.activeCondominiumId, nome: ctx.activeCondominiumName });
        if (!ctx.activeCondominiumId && pathname !== PAINEL_ADM) {
          router.replace(PAINEL_ADM);
        }
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [isAuthenticated, isLoading, userProfile.role, pathname, router]);

  async function handleTrocarCondominio() {
    setSaindo(true);
    try {
      await sairDoCondominioAction();
      setCondAtivo({ id: null, nome: null });
      router.push(PAINEL_ADM);
    } finally {
      setSaindo(false);
    }
  }

  // Enquanto verifica sessão, não renderiza nada
  if (isLoading) return null;

  // Não autenticado — aguarda redirect
  if (!isAuthenticated) return null;

  const mostrarBanner =
    userProfile.role === 'Administradora' &&
    condAtivo?.id &&
    pathname !== PAINEL_ADM;

  return (
    <PendenciasProvider>
    <AlertasSegurancaProvider>
    <div className="flex min-h-screen bg-wave-50">
      <Sidebar
        userProfile={userProfile}
        onLogout={logout}
        onSwitchProfile={(role) => { void setActiveProfile(role); }}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Barra superior — só existe em telas menores que lg (mobile/tablet).
            É onde o botão de abrir o menu mora, já que o Sidebar fica fora
            da tela por padrão nesse tamanho. */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-wave-100 sticky top-0 z-30">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-wave-600 hover:bg-wave-50 rounded-lg transition-colors"
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif text-lg text-wave-800">Wave</span>
        </header>

        {/* Seletor de condomínio ativo (SÍN-031) — aparece para usuários com
            vínculo em mais de um condomínio (ex.: síndico profissional). A
            Administradora usa o próprio fluxo de painel/banner abaixo. */}
        {userProfile.role !== 'Administradora' && <CondominioSwitcher />}

        {/* Banner de contexto da Administradora — indica qual condominio esta
            sendo gerenciado e permite voltar ao painel multi-condominio. */}
        {mostrarBanner && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-wave-800 px-4 py-2.5 sm:px-6 text-white">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="w-4 h-4 flex-shrink-0 text-wave-200" />
              <span className="text-sm truncate">
                Gerenciando <strong className="font-medium">{condAtivo?.nome}</strong>
              </span>
            </div>
            <button
              onClick={handleTrocarCondominio}
              disabled={saindo}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              {saindo ? 'Voltando...' : 'Trocar condomínio'}
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-wave-50">
          {children}
        </main>
      </div>
    </div>
    </AlertasSegurancaProvider>
    </PendenciasProvider>
  );
}
