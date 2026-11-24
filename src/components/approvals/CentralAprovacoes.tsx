'use client';

// ---------------------------------------------------------------------------
// src/components/approvals/CentralAprovacoes.tsx
//
// Central de Aprovações Pendentes (SÍN-026). Concentra, num único lugar, as
// solicitações que aguardam a decisão do Síndico (nesta fase: reservas e
// propostas aprovadas pela comunidade). Permite aprovar/rejeitar sem sair da
// tela, com confirmação, motivo na rejeição, atualização automática do contador
// e registro na trilha de Auditoria.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import {
  ClipboardCheck, CheckCircle, XCircle, Clock, AlertTriangle, ChevronDown,
  Loader2, RefreshCw, User, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';

import { usePendencias } from '@/contexts/PendenciasContext';
import { useUser } from '@/contexts/UserContext';
import { useBlockchainAutoRegistry } from '@/hooks/useBlockchainAutoRegistry';
import {
  PENDENCIA_TIPO_LABEL, PRAZO_STATUS_LABEL, PRAZO_STATUS_COR,
  prazoStatus, ordenarPendencias, validarMotivoDecisao,
  type Pendencia, type Decisao,
} from '@/components/approvals/pendencias';

function chave(p: Pendencia): string {
  return `${p.tipo}:${p.id}`;
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}
function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function CentralAprovacoes() {
  const { pendencias, loading, error, refresh, decidir } = usePendencias();
  const { userProfile } = useUser();
  const { registerApprovalDecision } = useBlockchainAutoRegistry();
  const responsavel = userProfile.name || 'Gestor';

  const [expandido, setExpandido] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ chave: string; modo: Decisao } | null>(null);
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [recarregando, setRecarregando] = useState(false);

  const ordenadas = useMemo(() => ordenarPendencias(pendencias), [pendencias]);
  const stats = useMemo(() => {
    let atrasadas = 0, proximas = 0;
    for (const p of pendencias) {
      const s = prazoStatus(p.prazo);
      if (s === 'atrasado') atrasadas++;
      else if (s === 'proximo') proximas++;
    }
    return { total: pendencias.length, atrasadas, proximas };
  }, [pendencias]);

  async function handleRefresh() {
    setRecarregando(true);
    await refresh();
    setRecarregando(false);
  }

  function abrirAcao(p: Pendencia, modo: Decisao) {
    setAcao({ chave: chave(p), modo });
    setMotivo('');
  }

  async function confirmar(p: Pendencia, decisao: Decisao) {
    if (decisao === 'rejeitar') {
      const erro = validarMotivoDecisao(p, motivo);
      if (erro) { toast.error(erro); return; }
    }
    setSubmitting(chave(p));
    const res = await decidir(p, decisao, decisao === 'rejeitar' ? motivo : undefined);
    setSubmitting(null);
    if (!res.ok) { toast.error(res.error); return; }

    void registerApprovalDecision({
      decisao: decisao === 'aprovar' ? 'aprovada' : 'rejeitada',
      tipoLabel: PENDENCIA_TIPO_LABEL[p.tipo],
      titulo: p.titulo,
      solicitante: p.solicitante,
      responsavel,
      motivo: decisao === 'rejeitar' ? motivo.trim() || undefined : undefined,
    });
    toast.success(decisao === 'aprovar' ? 'Solicitação aprovada.' : 'Solicitação rejeitada.');
    setAcao(null);
    setMotivo('');
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Aprovações Pendentes</h1>
          <p className="text-wave-500">Todas as solicitações que aguardam sua decisão, em um só lugar.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={recarregando}
          className="px-4 py-2.5 bg-white border border-wave-200 text-wave-700 rounded-xl shadow-sm flex items-center justify-center gap-2 hover:bg-wave-50 transition-all disabled:opacity-60 self-start"
        >
          <RefreshCw className={`w-4 h-4 ${recarregando ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Pendentes', value: stats.total, icon: ClipboardCheck, color: 'bg-wave-100', text: 'text-wave-600' },
          { label: 'Vencem em breve', value: stats.proximas, icon: Clock, color: 'bg-amber-100', text: 'text-amber-700' },
          { label: 'Atrasadas', value: stats.atrasadas, icon: AlertTriangle, color: 'bg-red-100', text: 'text-red-700' },
        ].map((s) => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-4 sm:p-5 shadow-lg">
            <div className={`inline-flex p-2 rounded-lg ${s.color} mb-3`}>
              <s.icon className={`w-5 h-5 ${s.text}`} />
            </div>
            <p className="text-2xl font-semibold text-wave-800">{s.value}</p>
            <p className="text-wave-500 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-2xl bg-wave-100 animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="py-12 text-center bg-white/80 rounded-2xl border border-wave-100 shadow-lg">
          <AlertTriangle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <p className="text-wave-600 text-sm mb-3">{error}</p>
          <button onClick={handleRefresh} className="px-4 py-2 bg-wave-700 text-white rounded-xl text-sm hover:bg-wave-600">Tentar novamente</button>
        </div>
      ) : ordenadas.length === 0 ? (
        <div className="py-16 text-center bg-white/80 rounded-2xl border border-wave-100 shadow-lg">
          <CheckCircle className="w-10 h-10 text-brand-teal mx-auto mb-3" />
          <p className="text-wave-700 font-medium">Nenhuma pendência aguardando decisão.</p>
          <p className="text-wave-500 text-sm mt-1">Assim que houver uma nova solicitação, ela aparece aqui.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {ordenadas.map((p) => {
            const k = chave(p);
            const urg = prazoStatus(p.prazo);
            const aberto = expandido === k;
            const acaoAtual = acao?.chave === k ? acao.modo : null;
            const enviando = submitting === k;

            return (
              <li key={k} className="bg-white/90 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-wave-100 text-wave-600">
                          {PENDENCIA_TIPO_LABEL[p.tipo]}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRAZO_STATUS_COR[urg]}`}>
                          {PRAZO_STATUS_LABEL[urg]}
                        </span>
                      </div>
                      <p className="text-wave-800 font-semibold truncate">{p.titulo}</p>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-wave-500 text-xs">
                        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {p.solicitante}</span>
                        <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" /> Entrada: {fmtData(p.dataEntrada)}</span>
                        {p.prazo && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Prazo: {fmtDataHora(p.prazo)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => setExpandido(aberto ? null : k)}
                      aria-expanded={aberto}
                      className="p-2 text-wave-400 hover:bg-wave-50 rounded-lg shrink-0"
                      aria-label="Ver detalhes"
                    >
                      <ChevronDown className={`w-5 h-5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Detalhes complementares */}
                  {aberto && p.detalhes.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-wave-50 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                      {p.detalhes.map((d, i) => (
                        <div key={i} className="text-sm">
                          <span className="text-wave-400 text-xs block">{d.label}</span>
                          <span className="text-wave-700">{d.valor}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ações */}
                  {acaoAtual === 'aprovar' ? (
                    <div className="mt-4 bg-brand-teal/10 border border-brand-teal/30 rounded-xl p-3 flex items-center gap-2">
                      <p className="text-wave-700 text-sm flex-1">Confirmar a <strong>aprovação</strong> desta solicitação?</p>
                      <button onClick={() => confirmar(p, 'aprovar')} disabled={enviando} className="px-3 py-1.5 bg-brand-teal text-white rounded-lg text-xs flex items-center gap-1.5 hover:opacity-90 disabled:opacity-60">
                        {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Confirmar
                      </button>
                      <button onClick={() => setAcao(null)} disabled={enviando} className="px-3 py-1.5 bg-white border border-wave-200 text-wave-600 rounded-lg text-xs">Cancelar</button>
                    </div>
                  ) : acaoAtual === 'rejeitar' ? (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                      <label htmlFor={`motivo-${k}`} className="block text-red-800 text-xs font-medium">
                        Motivo da rejeição {p.rejeicaoMotivoObrigatorio ? '(obrigatório)' : '(opcional)'}
                      </label>
                      <textarea
                        id={`motivo-${k}`}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 bg-white border border-wave-200 rounded-lg text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                        placeholder="Explique o motivo para o solicitante..."
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setAcao(null)} disabled={enviando} className="px-3 py-1.5 bg-white border border-wave-200 text-wave-600 rounded-lg text-xs">Cancelar</button>
                        <button onClick={() => confirmar(p, 'rejeitar')} disabled={enviando} className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs flex items-center gap-1.5 hover:bg-red-700 disabled:opacity-60">
                          {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Confirmar rejeição
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex gap-2">
                      <button onClick={() => abrirAcao(p, 'aprovar')} className="flex-1 py-2.5 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl flex items-center justify-center gap-2 text-sm hover:opacity-90 transition-all">
                        <CheckCircle className="w-4 h-4" /> Aprovar
                      </button>
                      <button onClick={() => abrirAcao(p, 'rejeitar')} className="flex-1 py-2.5 bg-white border border-red-200 text-red-600 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-red-50 transition-all">
                        <XCircle className="w-4 h-4" /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
