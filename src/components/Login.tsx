'use client';

import { useState } from 'react';
import { ArrowRight, ArrowLeft, Shield, Vote, FileText, Home, Building2, Settings, Users, User as UserIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/contexts/I18nContext';
import { LanguageSelector } from '@/components/LanguageSelector';
import type { AppRole } from '@/hooks/useAuth';

interface LoginProps {
  onLogin: (email: string, password: string) => Promise<any>;
  // SÍN-003: escolha de perfil quando o usuário tem mais de um.
  onChooseProfile?: (role: AppRole) => Promise<{ error: any }>;
  needsProfileChoice?: boolean;
  availableRoles?: AppRole[];
}

// Ícone por perfil — apoia a leitura rápida do porteiro/idoso (ícone + texto).
const ROLE_ICON: Record<AppRole, LucideIcon> = {
  'Síndico': Shield,
  Conselho: Users,
  Morador: Home,
  Administradora: Building2,
  Admin: Settings,
};

// SEG-005 / SÍN-002 — Login rápido (demo): só deve existir em dev/homolog.
// A env var NEXT_PUBLIC_SHOW_DEMO_LOGINS NUNCA deve ser definida no projeto de
// PRODUÇÃO na Vercel. Sem ela, o Next.js elimina este bloco (e a senha demo)
// do bundle de produção em tempo de build — não é apenas "esconder" em
// runtime, o literal da senha não chega a existir no JS entregue ao cliente.
const SHOW_DEMO_LOGINS = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGINS === 'true';

// Senha do seed de dev/homolog, também fora do código-fonte (nunca hardcoded
// em texto no repositório, mesmo sendo uma credencial de baixo valor).
const DEMO_SEED_PASSWORD = process.env.NEXT_PUBLIC_DEMO_SEED_PASSWORD || '';

export function Login({ onLogin, onChooseProfile, needsProfileChoice = false, availableRoles = [] }: LoginProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  // Perfil sendo ativado (feedback de carregamento no botão escolhido).
  const [choosingRole, setChoosingRole] = useState<AppRole | null>(null);

  const handleLogin = async () => {
    if (!formData.email || !formData.password) {
      toast.error(t('login.errors.fillFields'));
      return;
    }
    setLoading(true);
    try {
      const { error } = await onLogin(formData.email, formData.password);
      if (error) toast.error(t('login.errors.invalidCredentials'));
      // Sucesso: o hook decide entre navegar (perfil único) ou exibir a
      // escolha de perfil (needsProfileChoice) — nada a fazer aqui.
    } catch {
      toast.error(t('login.errors.unexpected'));
    } finally {
      setLoading(false);
    }
  };

  const handleChoose = async (role: AppRole) => {
    if (!onChooseProfile) return;
    setChoosingRole(role);
    try {
      const { error } = await onChooseProfile(role);
      if (error) toast.error(t('login.chooseProfile.switchError'));
    } catch {
      toast.error(t('login.chooseProfile.switchError'));
    } finally {
      setChoosingRole(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-abyss flex relative">

      {/* Seletor de idioma — canto superior direito, sem afetar o layout.
          Offsets responsivos evitam colar na borda em telas pequenas. */}
      <LanguageSelector className="absolute top-3 right-3 sm:top-4 sm:right-4 z-30" />

      <div className="hidden lg:flex flex-col justify-between w-[45%] bg-brand-abyss p-14">
        <div>
          <div className="flex items-center gap-3 mb-16">
            {/* Logo oficial da marca (mesmos assets da tela de Boas-Vindas) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mark.png" alt="" aria-hidden="true" className="h-11 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark-light.png" alt="Wave Condominium" className="h-9 w-auto" />
          </div>

          {/* Título no mesmo padrão do hero da Boas-Vindas: Montserrat branco,
              entrelinha 1.14, destaque em azul oficial (--blue / brand-blue). */}
          <h1 className="font-display text-4xl text-white font-normal leading-[1.14] mb-4">
            {t('login.hero.titlePrefix')}{' '}
            <span className="text-brand-blue">{t('login.hero.titleHighlight')}</span>
          </h1>
          <p className="text-brand-chrome leading-relaxed mb-12">
            {t('login.hero.subtitle')}
          </p>

          <div className="space-y-4">
            {[
              { icon: Vote,     label: t('login.hero.features.governanca.label'),    desc: t('login.hero.features.governanca.desc') },
              { icon: FileText, label: t('login.hero.features.documentos.label'),    desc: t('login.hero.features.documentos.desc') },
              { icon: Shield,   label: t('login.hero.features.transparencia.label'), desc: t('login.hero.features.transparencia.desc') },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-white/5 border border-brand-chrome/20 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4 h-4 text-brand-teal" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{item.label}</p>
                  <p className="text-brand-chrome text-xs">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-brand-chrome/60 text-xs">
          {t('login.hero.footer')}
        </p>
      </div>

      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 overflow-hidden bg-brand-deep">

        <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 sm:p-8 border border-brand-chrome/20">

          <div className="lg:hidden flex items-center justify-center gap-3 mb-10">
            {/* Logo oficial da marca (mesmos assets da tela de Boas-Vindas) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mark.png" alt="" aria-hidden="true" className="h-10 w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark-dark.png" alt="Wave Condominium" className="h-8 w-auto" />
          </div>

          {needsProfileChoice && onChooseProfile ? (
            /* SÍN-003 — Escolha de perfil: usuário com mais de um perfil decide
               com qual acessar. A sessão já foi criada com o perfil primário;
               a escolha re-emite a sessão com o perfil ativo (validado no
               servidor). Botões grandes com ícone + texto (acessibilidade). */
            <div>
              <div className="mb-8">
                <p className="inline-flex items-center gap-2 mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-teal">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
                  {t('login.badge')}
                </p>
                <h2 className="font-display text-2xl text-brand-navy font-normal">{t('login.chooseProfile.title')}</h2>
                <p className="mt-2 text-brand-grey text-sm leading-relaxed">{t('login.chooseProfile.subtitle')}</p>
              </div>

              <div className="space-y-3">
                {availableRoles.map((role) => {
                  const Icon = ROLE_ICON[role] ?? UserIcon;
                  const isBusy = choosingRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleChoose(role)}
                      disabled={choosingRole !== null}
                      className="w-full flex items-center gap-4 p-4 min-h-[64px] rounded-xl border border-brand-chrome/60 hover:border-brand-teal hover:bg-brand-light transition-all text-left disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                    >
                      <span className="w-11 h-11 rounded-xl bg-brand-light flex items-center justify-center flex-shrink-0">
                        <Icon className="w-5 h-5 text-brand-steel" />
                      </span>
                      <span className="flex-1 min-w-0 text-brand-navy font-medium text-base">
                        {t('login.chooseProfile.enterAs')} {role}
                      </span>
                      {isBusy ? (
                        <span className="text-brand-grey text-sm">{t('login.signingIn')}</span>
                      ) : (
                        <ArrowRight className="w-4 h-4 text-brand-steel flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => router.push('/')}
                className="w-full mt-6 py-2.5 text-brand-grey hover:text-brand-navy transition-all flex items-center justify-center gap-2 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('login.back')}
              </button>
            </div>
          ) : (
          <>
          <div className="mb-8">
            <p className="inline-flex items-center gap-2 mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
              {t('login.badge')}
            </p>
            <h2 className="font-display text-2xl text-brand-navy font-normal">{t('login.title')}</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-brand-ink text-sm font-medium mb-1.5">{t('login.emailLabel')}</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder={t('login.emailPlaceholder')}
                className="w-full px-4 py-3 bg-white border border-brand-chrome/60 rounded-xl text-brand-ink placeholder-brand-grey/70 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal transition-all text-base"
              />
            </div>

            <div>
              <label className="block text-brand-ink text-sm font-medium mb-1.5">{t('login.passwordLabel')}</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-white border border-brand-chrome/60 rounded-xl text-brand-ink placeholder-brand-grey/70 focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal transition-all text-base"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-brand-grey cursor-pointer">
                <input type="checkbox" className="rounded accent-brand-steel w-3.5 h-3.5" />
                <span>{t('login.remember')}</span>
              </label>
              <Link
                href="/forgot-password"
                className="text-brand-steel hover:text-brand-navy text-sm font-medium"
              >
                {t('login.forgot')}
              </Link>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-brand-blue text-brand-deep rounded-xl hover:opacity-90 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 font-medium text-base"
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>

          <div className="mt-6 pt-5 border-t border-brand-light">
            {SHOW_DEMO_LOGINS && (
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: t('login.demo.sindico'),        email: 'sindico@wave.com' },
                  { label: t('login.demo.morador'),        email: 'morador@wave.com' },
                  { label: t('login.demo.administradora'), email: 'administradora@wave.com' },
                ].map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setFormData({ email: item.email, password: DEMO_SEED_PASSWORD })}
                    className="px-2 py-1.5 bg-brand-light border border-brand-chrome/50 rounded-lg text-brand-grey hover:border-brand-steel hover:text-brand-navy transition-all text-center"
                  >
                    <p className="font-medium text-xs">{item.label}</p>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full mt-4 py-2.5 text-brand-grey hover:text-brand-navy transition-all flex items-center justify-center gap-2 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('login.back')}
            </button>
          </div>
          </>
          )}

        </div>
      </div>
    </div>
  );
}
