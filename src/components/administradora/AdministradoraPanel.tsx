'use client';

// ---------------------------------------------------------------------------
// Painel da Administradora (canal multi-condominio).
//
// Mostra metricas consolidadas de todos os condominios sob a administradora e
// um card por condominio com o botao "Gerenciar", que seleciona o condominio
// ativo (reemite a sessao no servidor) e leva ao dashboard normal — a partir
// dai a Administradora atua como gestora daquele condominio, reutilizando todas
// as telas existentes.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2, Users, Receipt, Vote, ArrowRight, Loader2, Plus } from 'lucide-react';
import {
  listCondominiosAction,
  selecionarCondominioAction,
  type PainelAdministradora,
} from '@/app/actions/administradora';

export function AdministradoraPanel() {
  const router = useRouter();
  const [data, setData] = useState<PainelAdministradora | null>(null);
  const [loading, setLoading] = useState(true);
  const [entrando, setEntrando] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    listCondominiosAction()
      .then((res) => ativo && setData(res))
      .catch(() => ativo && toast.error('Nao foi possivel carregar os condominios.'))
      .finally(() => ativo && setLoading(false));
    return () => {
      ativo = false;
    };
  }, []);

  async function handleGerenciar(id: string) {
    setEntrando(id);
    try {
      const res = await selecionarCondominioAction(id);
      if (res.ok) {
        router.push('/dashboard');
      } else {
        toast.error('Nao foi possivel acessar este condominio.');
        setEntrando(null);
      }
    } catch {
      toast.error('Erro ao acessar o condominio.');
      setEntrando(null);
    }
  }

  const totais = data?.totais;

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      {/* Header */}
      <div className="mb-6 sm:mb-8 relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl bg-wave-500 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-display text-brand-navy text-2xl sm:text-3xl">Painel da Administradora</h1>
          </div>
          <p className="text-wave-500">
            Visao consolidada dos condominios sob sua gestao. Selecione um para gerenciar.
          </p>
        </div>
        {/* SÍN-030: onboarding de um novo condomínio sob a administradora. */}
        <button
          onClick={() => router.push('/dashboard/onboarding')}
          className="self-start inline-flex items-center gap-2 min-h-[48px] px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg"
        >
          <Plus className="w-5 h-5" /> Cadastrar condomínio
        </button>
      </div>

      {/* Metricas consolidadas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8 relative z-10">
        <MetricCard icon={Building2} label="Condominios" value={totais?.condominios} loading={loading} />
        <MetricCard icon={Users} label="Moradores" value={totais?.moradores} loading={loading} />
        <MetricCard icon={Receipt} label="Boletos em aberto" value={totais?.boletosEmAberto} loading={loading} />
        <MetricCard icon={Vote} label="Propostas ativas" value={totais?.propostasAtivas} loading={loading} />
      </div>

      {/* Lista de condominios */}
      <div className="relative z-10">
        <h2 className="text-wave-800 text-lg sm:text-xl mb-4">Condominios</h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white/60 border border-wave-100 animate-pulse" />
            ))}
          </div>
        ) : !data || data.condominios.length === 0 ? (
          <div className="rounded-2xl border border-wave-100 bg-white/80 backdrop-blur-sm p-10 text-center shadow-lg">
            <Building2 className="w-10 h-10 text-wave-300 mx-auto mb-3" />
            <p className="text-wave-600 font-medium">Nenhum condominio vinculado</p>
            <p className="text-wave-400 text-sm mt-1">
              Assim que condominios forem atribuidos a esta administradora, eles aparecerao aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.condominios.map((c) => (
              <div
                key={c.id}
                className="flex flex-col rounded-2xl border border-wave-100 bg-white/90 backdrop-blur-sm p-5 shadow-lg transition-shadow hover:shadow-xl"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-wave-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-wave-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-wave-800 font-medium truncate">{c.name}</h3>
                    <p className="text-wave-400 text-xs">{c.totalMoradores} morador(es)</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <MiniStat label="Boletos em aberto" value={c.boletosEmAberto} tone={c.boletosEmAberto > 0 ? 'alerta' : 'ok'} />
                  <MiniStat label="Propostas ativas" value={c.propostasAtivas} tone="neutro" />
                </div>

                <button
                  onClick={() => handleGerenciar(c.id)}
                  disabled={entrando !== null}
                  className="mt-auto w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-deep to-brand-steel text-white text-sm font-medium transition-all hover:from-wave-700 hover:to-wave-600 disabled:opacity-60"
                >
                  {entrando === c.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Entrando...
                    </>
                  ) : (
                    <>
                      Gerenciar <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-wave-100 bg-white/90 backdrop-blur-sm p-4 sm:p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-2 text-wave-500">
        <Icon className="w-4 h-4" />
        <span className="text-xs sm:text-sm truncate">{label}</span>
      </div>
      {loading ? (
        <div className="h-8 w-16 rounded bg-wave-100 animate-pulse" />
      ) : (
        <p className="text-2xl sm:text-3xl font-semibold text-wave-800">{value ?? 0}</p>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'alerta' | 'neutro';
}) {
  const toneClass =
    tone === 'alerta'
      ? 'text-amber-700 bg-amber-50 border-amber-100'
      : tone === 'ok'
        ? 'text-brand-teal bg-brand-teal/10 border-brand-teal/20'
        : 'text-wave-700 bg-wave-50 border-wave-100';
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="text-[11px] mt-1 leading-tight">{label}</p>
    </div>
  );
}
