'use client';

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { CondominioOnboardingWizard } from '@/components/onboarding/CondominioOnboardingWizard';
import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';

export default function OnboardingPage() {
  const { userProfile, isLoading } = useUser();
  const router = useRouter();

  if (isLoading) return null;

  // RBAC (SÍN-030): cadastro de condomínio é exclusivo de gestão
  // (Síndico/Administradora/Admin). O servidor revalida (requireManager); aqui
  // damos uma mensagem clara. O Morador nunca cadastra condomínio.
  if (!isManager(userProfile.role)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-2xl border border-wave-100 shadow-lg p-8 max-w-sm">
          <ShieldAlert className="w-10 h-10 text-orange-500 mx-auto mb-3" />
          <h2 className="text-wave-800 font-semibold mb-1">Acesso restrito</h2>
          <p className="text-wave-500 text-sm">
            O cadastro de condomínio é exclusivo do síndico e da administradora responsável.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Cadastrar condomínio</h1>
        <p className="text-wave-500">
          Dados cadastrais, bancários e vínculo com o PSP (subconta + KYC) para começar a operar.
        </p>
      </div>
      <CondominioOnboardingWizard onConcluido={() => router.push('/dashboard/administradora')} />
    </div>
  );
}
