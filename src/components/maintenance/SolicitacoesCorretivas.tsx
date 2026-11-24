'use client';

// ---------------------------------------------------------------------------
// src/components/maintenance/SolicitacoesCorretivas.tsx
//
// Solicitações de manutenção (corretiva) do morador — fonte real = PostgreSQL
// (SÍN-026). O morador abre a solicitação e ela aguarda a decisão do síndico na
// Central de Aprovações (aprovar = Em andamento; recusar = com motivo). Este
// componente é autocontido (lista + nova solicitação), substituindo o fluxo
// antigo em localStorage sem mexer no restante do módulo.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useState } from 'react';
import { Plus, Wrench, Clock, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { CreateMaintenanceModal } from './CreateMaintenanceModal';
import {
  listMinhasSolicitacoesAction,
  criarSolicitacaoAction,
} from '@/app/actions/manutencao';
import {
  STATUS_SOLICITACAO_LABEL,
  STATUS_SOLICITACAO_COR,
  PRIORIDADE_LABEL,
  type Solicitacao,
  type StatusSolicitacao,
} from './solicitacoes';

type Filtro = 'all' | StatusSolicitacao;

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'aguardando', label: 'Aguardando' },
  { key: 'em_andamento', label: 'Em andamento' },
  { key: 'concluida', label: 'Concluídas' },
  { key: 'recusada', label: 'Recusadas' },
];

function fmtData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export function SolicitacoesCorretivas() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [showCreate, setShowCreate] = useState(false);

  async function carregar() {
    try {
      const lista = await listMinhasSolicitacoesAction();
      setSolicitacoes(lista);
      setError(null);
    } catch (e) {
      console.error('Falha ao carregar solicitações', e);
      setError('Não foi possível carregar suas solicitações.');
    }
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listMinhasSolicitacoesAction()
      .then((l) => { if (alive) { setSolicitacoes(l); setError(null); } })
      .catch((e) => { console.error('Falha ao carregar solicitações', e); if (alive) setError('Não foi possível carregar suas solicitações.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtradas = useMemo(
    () => (filtro === 'all' ? solicitacoes : solicitacoes.filter((s) => s.status === filtro)),
    [solicitacoes, filtro],
  );

  const counts = useMemo(() => ({
    aguardando: solicitacoes.filter((s) => s.status === 'aguardando').length,
    em_andamento: solicitacoes.filter((s) => s.status === 'em_andamento').length,
    concluida: solicitacoes.filter((s) => s.status === 'concluida').length,
  }), [solicitacoes]);

  async function handleCreate(order: { title: string; category: string; priority: string; description: string }) {
    const res = await criarSolicitacaoAction({
      titulo: order.title,
      categoria: order.category,
      prioridade: (order.priority as 'high' | 'medium' | 'low') ?? 'medium',
      descricao: order.description,
    });
    if (!res.ok) { toast.error(res.error); return; }
    setSolicitacoes((prev) => [res.solicitacao, ...prev]);
    setShowCreate(false);
    toast.success('Solicitação enviada!', { description: 'O síndico vai analisar e você acompanha o status aqui.' });
  }

  return (
    <div>
      {/* Ações + stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="grid grid-cols-3 gap-3 flex-1">
          {[
            { label: 'Aguardando', value: counts.aguardando, color: 'text-amber-600' },
            { label: 'Em andamento', value: counts.em_andamento, color: 'text-blue-600' },
            { label: 'Concluídas', value: counts.concluida, color: 'text-emerald-600' },
          ].map((s) => (
            <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-wave-100 p-4 text-center shadow-sm">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-sm text-wave-500">{s.label}</p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-5 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center justify-center gap-2 self-start"
        >
          <Plus className="w-5 h-5" /> Nova Solicitação
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-wave-100 mb-6 shadow-sm">
        <div className="flex gap-2 overflow-x-auto">
          {FILTROS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap text-sm ${
                filtro === key ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg' : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-4" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="h-24 rounded-2xl bg-wave-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-white/80 rounded-2xl border border-wave-100 p-8 text-center shadow-sm">
          <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-wave-600 text-sm mb-3">{error}</p>
          <button onClick={() => { setLoading(true); carregar().finally(() => setLoading(false)); }} className="px-4 py-2 bg-wave-700 text-white rounded-xl text-sm inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Tentar novamente
          </button>
        </div>
      ) : filtradas.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-12 text-center shadow-sm">
          <Wrench className="w-12 h-12 text-wave-300 mx-auto mb-4" />
          <h3 className="text-wave-700 text-lg mb-2">
            {filtro === 'all' ? 'Nenhuma solicitação registrada' : 'Nenhuma solicitação neste filtro'}
          </h3>
          <p className="text-wave-400 text-sm mb-4">
            {filtro === 'all' ? 'Precisa de um reparo na sua unidade? Clique em "Nova Solicitação".' : 'Tente outro filtro.'}
          </p>
          {filtro === 'all' && (
            <button onClick={() => setShowCreate(true)} className="px-5 py-2.5 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nova Solicitação
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtradas.map((s) => (
            <div key={s.id} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_SOLICITACAO_COR[s.status]}`}>
                      {STATUS_SOLICITACAO_LABEL[s.status]}
                    </span>
                    <span className="text-wave-400 text-xs">#{s.protocolo}</span>
                  </div>
                  <p className="text-wave-800 font-medium truncate">{s.titulo}</p>
                  <p className="text-wave-500 text-sm mt-0.5">{s.categoria} · Prioridade {PRIORIDADE_LABEL[s.prioridade]}</p>
                  {s.descricao && <p className="text-wave-500 text-sm mt-1.5">{s.descricao}</p>}
                  {s.status === 'recusada' && s.motivoRecusa && (
                    <p className="text-red-600 text-xs mt-1.5">Motivo da recusa: {s.motivoRecusa}</p>
                  )}
                </div>
                <div className="text-right shrink-0 text-wave-400 text-xs flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {fmtData(s.aberturaEm)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateMaintenanceModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
