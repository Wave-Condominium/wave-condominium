// ---------------------------------------------------------------------------
// src/app/ativar/[token]/page.tsx
//
// Rota PÚBLICA de ativação de acesso do morador (SÍN-022). Fica fora do
// matcher do middleware (que protege /dashboard e /force-change-password),
// portanto é acessível sem sessão — o token é o portador da autorização.
// ---------------------------------------------------------------------------

import { AtivarConta } from '@/components/access/AtivarConta';

export const dynamic = 'force-dynamic';

export default async function AtivarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AtivarConta token={token} />;
}
