'use client';

import { LayoutDashboard, Vote, Wallet, FileText, Wrench, Home, LogOut, Settings, SlidersHorizontal, Video, Receipt, Shield, MessageSquare, UserPlus, User, X, Building2, Repeat, ClipboardCheck, ShieldAlert } from 'lucide-react';
import { formatDisplayName } from '@/lib/formatName';
import { useNotifications } from '@/hooks/useNotifications';
import { useMenuBadges } from '@/hooks/useMenuBadges';
import { usePendencias } from '@/contexts/PendenciasContext';
import { useAlertasSeguranca } from '@/contexts/AlertasSegurancaContext';
import { isManager, isAdministradora, type Role } from '@/lib/rbac';
import { ThemeToggle } from './ThemeToggle';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface SidebarProps {
  userProfile: {
    name: string;
    unit: string;
    role: Role;
    email: string;
    avatar?: string;
    // SÍN-003: perfis que o usuário pode assumir. Único = [role].
    availableRoles?: Role[];
  };
  onLogout: () => void;
  // SÍN-003: troca de perfil ativo (só aparece quando há mais de um perfil).
  onSwitchProfile?: (role: Role) => void;
  // Novos props (opcionais) — controlam o drawer em telas mobile.
  // Em desktop (lg+) não têm efeito nenhum, o menu fica sempre visível.
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ userProfile, onLogout, onSwitchProfile, isMobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const isManagerRole = isManager(userProfile.role);
  // SEG-016: menu de Eventos de Segurança visível p/ Admin de plataforma,
  // Síndico e Administradora (cada um com seu escopo — ver
  // resolverEscopoConsulta no servidor, que é a autoridade real). Morador e
  // Conselho seguem sem acesso.
  const podeVerEventosSeguranca =
    userProfile.role === 'Admin' || userProfile.role === 'Síndico' || userProfile.role === 'Administradora';
  // Perfis alternativos ao ATIVO (SÍN-003). Vazio quando o usuário tem 1 só.
  const outrosPerfis = (userProfile.availableRoles ?? [userProfile.role]).filter(
    (r) => r !== userProfile.role,
  );
  const { unreadCount } = useNotifications();
  const { governanceCount, communicationCount, meetingsCount, boletosCount, maintenanceCount } = useMenuBadges();
  // SÍN-026: contador de pendências da Central de Aprovações (só gestão).
  const { count: pendenciasCount } = usePendencias();
  const { count: alertasSegurancaCount } = useAlertasSeguranca();

  // Fecha o menu mobile automaticamente ao navegar para outra rota —
  // melhoria de UX (sem isso, o menu ficaria aberto cobrindo a tela nova)
  useEffect(() => {
    onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const menuItems = [
    // Administradora (canal multi-condominio): acesso ao painel consolidado.
    ...(isAdministradora(userProfile.role)
      ? [{ href: '/dashboard/administradora', label: 'Painel Administradora', icon: Building2 }]
      : []),
    { href: '/dashboard',                label: 'Dashboard',   icon: LayoutDashboard, badge: unreadCount > 0 ? unreadCount : undefined },
    { href: '/dashboard/governance',     label: 'Governança',  icon: Vote,            badge: governanceCount > 0 ? governanceCount : undefined },
    { href: '/dashboard/communication',  label: 'Comunicação', icon: MessageSquare,   badge: communicationCount > 0 ? communicationCount : undefined },
    { href: '/dashboard/meetings',       label: 'Reuniões',    icon: Video,           badge: meetingsCount > 0 ? meetingsCount : undefined },
    { href: '/dashboard/boletos',        label: 'Boletos',     icon: Receipt,         badge: boletosCount > 0 ? boletosCount : undefined },
    { href: '/dashboard/treasury',       label: 'Tesouraria',  icon: Wallet },
    { href: '/dashboard/documents',      label: 'Documentos',  icon: FileText },
    { href: '/dashboard/maintenance',    label: 'Manutenção',  icon: Wrench,          badge: maintenanceCount > 0 ? maintenanceCount : undefined },
    { href: '/dashboard/blockchain',     label: 'Auditoria',  icon: Shield },
    { href: '/dashboard/units',          label: 'Unidades',    icon: Home },
    // SEG-016: item próprio (não entra no bloco isManagerRole abaixo, que
    // inclui Administradora — ver comentário em podeVerEventosSeguranca).
    ...(podeVerEventosSeguranca ? [
      { href: '/dashboard/security-events', label: 'Eventos de Segurança', icon: ShieldAlert, badge: alertasSegurancaCount > 0 ? alertasSegurancaCount : undefined },
    ] : []),
    // RBAC (regra permanente do projeto): "Criar Nova Conta" é restrito a
    // Síndico/Administrador — Morador não deve ver esse item no menu.
    ...(isManagerRole ? [
      { href: '/dashboard/approvals', label: 'Aprovações', icon: ClipboardCheck, badge: pendenciasCount > 0 ? pendenciasCount : undefined },
      { href: '/dashboard/create-account', label: 'Criar Nova Conta', icon: UserPlus },
      { href: '/dashboard/admin', label: 'Admin Panel', icon: Settings },
      { href: '/dashboard/settings', label: 'Configurações', icon: SlidersHorizontal },
    ] : [])
  ];

  const displayName = formatDisplayName(userProfile.name);

  return (
    <>
      {/* Fundo escurecido atrás do menu — só em mobile, só quando aberto.
          Clicar nele fecha o menu (padrão universal de drawer). */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`w-64 bg-white border-r border-wave-200 flex flex-col h-screen fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 lg:sticky lg:top-0 lg:z-auto`}
      >

        {/* Logo */}
        <div className="px-6 py-6 border-b border-wave-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-wave-500 flex items-center justify-center">
              <span className="text-white text-xs font-serif">W</span>
            </div>
            <div>
              <h1 className="font-serif text-xl text-wave-800 leading-none">Wave</h1>
              <p className="text-wave-400 text-xs mt-0.5 italic font-serif">Gestão Condominial</p>
            </div>
          </div>
          {/* Botão fechar — só existe em mobile */}
          <button
            onClick={onMobileClose}
            className="lg:hidden p-1 text-wave-400 hover:text-wave-600 transition-colors"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Perfil do usuário */}
        <div className="px-4 py-4 border-b border-wave-100">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-wave-50">
            <div className="w-9 h-9 rounded-full bg-wave-100 border border-wave-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {userProfile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={userProfile.avatar} alt={userProfile.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-wave-300" aria-label={userProfile.name} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-wave-800 text-sm font-medium truncate">{displayName}</p>
              <p className="text-wave-400 text-xs truncate font-serif italic">{userProfile.role} · {userProfile.unit}</p>
            </div>
          </div>
        </div>

        {/* Navegação */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="space-y-0.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all group ${
                    isActive
                      ? 'bg-wave-100 text-wave-700'
                      : 'text-wave-400 hover:bg-wave-50 hover:text-wave-600'
                  }`}
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-wave-600' : 'text-wave-300 group-hover:text-wave-500'}`} />
                  <span className="flex-1">{item.label}</span>
                  {isActive && (
                    <div className="w-1 h-4 rounded-full bg-wave-500" />
                  )}
                  {!isActive && item.badge && (
                    <span className="px-1.5 py-0.5 bg-wave-500 text-white rounded-full text-xs leading-none">
                      {item.badge}
                    </span>
                  )}
                  {isActive && item.badge && (
                    <span className="px-1.5 py-0.5 bg-wave-500 text-white rounded-full text-xs leading-none">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Trocar de perfil (SÍN-003) — só quando o usuário tem mais de um.
            Botão grande com ícone + texto; troca o perfil ativo sem deslogar. */}
        {onSwitchProfile && outrosPerfis.length > 0 && (
          <div className="px-3 pt-3 border-t border-wave-100 space-y-1">
            {outrosPerfis.map((role) => (
              <button
                key={role}
                onClick={() => onSwitchProfile(role)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-wave-500 hover:bg-wave-50 hover:text-wave-700 transition-all"
              >
                <Repeat className="w-4 h-4 flex-shrink-0" />
                <span>Entrar como {role}</span>
              </button>
            ))}
          </div>
        )}

        {/* Tema + Logout */}
        <div className="px-3 py-4 border-t border-wave-100 space-y-1">
          <ThemeToggle />
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-wave-400 hover:bg-wave-50 hover:text-wave-600 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sair da conta</span>
          </button>
        </div>
      </aside>
    </>
  );
}
