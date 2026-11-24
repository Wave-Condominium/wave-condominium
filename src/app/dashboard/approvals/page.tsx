'use client';

import { ShieldAlert } from 'lucide-react';

import { CentralAprovacoes } from '@/components/approvals/CentralAprovacoes';
import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';

export default function ApprovalsPage() {
  const { userProfile, isLoading } = useUser();

  if (isLoading) return null;

  // RBAC: a Central é exclusiva de gestão (Síndico/Admin). O servidor também
  // valida (requireManager); aqui damos uma mensagem clara em vez de uma tela
  // de erro para quem não tem acesso.
  if (!isManager(userProfile.role)) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center bg-white rounded-2xl border border-wave-100 shadow-lg p-8 max-w-sm">
          <ShieldAlert className="w-10 h-10 text-orange-500 mx-auto mb-3" />
          <h2 className="text-wave-800 font-semibold mb-1">Acesso restrito</h2>
          <p className="text-wave-500 text-sm">A Central de Aprovações é exclusiva do síndico e da administração do condomínio.</p>
        </div>
      </div>
    );
  }

  return <CentralAprovacoes />;
}
