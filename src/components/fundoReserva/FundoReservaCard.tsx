'use client';

// ---------------------------------------------------------------------------
// src/components/fundoReserva/FundoReservaCard.tsx  —  MOR-023
//
// Card do Fundo de Reserva no Dashboard do Morador. SOMENTE LEITURA: saldo
// disponível, valor investido, total, última atualização, origem (Open Finance)
// e selo verificável. Trata: não conectado, consentimento expirado/revogado
// (não mostra valores como atuais) e reconexão (Síndico).
// ---------------------------------------------------------------------------

import { PiggyBank, Landmark, TrendingUp, ShieldCheck, RefreshCw, AlertTriangle, ExternalLink, Loader2, Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { useFundoReserva } from '@/hooks/useFundoReserva';
import {
  formatFundo,
  precisaReconectar,
  estaDesatualizado,
  STATUS_CONEXAO_LABEL,
} from '@/components/fundoReserva/fundoReserva';

function fmtDataHora(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function FundoReservaCard() {
  const { view, podeGerenciar, loading, busy, error, atualizar, conectar, desconectar } = useFundoReserva();

  if (loading) {
    return <div className="h-56 rounded-2xl bg-wave-100 animate-pulse" aria-busy="true" />;
  }

  const semConexao = !view || view.status === 'DESCONECTADO';
  const reconectar = view ? precisaReconectar(view.status, view.consentimentoExpiraEm) : true;
  const temValores = view && view.consultadoEm && !reconectar;
  const desatualizado = view ? estaDesatualizado(view.consultadoEm) : true;

  async function handleConectar() {
    const r = await conectar();
    if (!r.ok) toast.error(r.error);
    else toast.success('Open Finance conectado. Fundo de Reserva atualizado.');
  }
  async function handleAtualizar() {
    const r = await atualizar();
    if (!r.ok) toast.error(r.error);
  }

  return (
    <div className="bg-white rounded-2xl border border-wave-100 shadow-lg p-5 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-xl bg-brand-teal/15 shrink-0">
            <PiggyBank className="w-5 h-5 text-brand-teal" />
          </div>
          <div className="min-w-0">
            <h3 className="text-wave-800 font-semibold">Fundo de Reserva</h3>
            <p className="text-wave-400 text-xs flex items-center gap-1">
              <Link2 className="w-3 h-3" /> Dados via Open Finance{view?.instituicao ? ` · ${view.instituicao}` : ''}
            </p>
          </div>
        </div>
        {view && (
          <span className="px-2.5 py-1 rounded-full text-xs font-medium shrink-0 bg-wave-100 text-wave-600">
            {STATUS_CONEXAO_LABEL[view.status]}
          </span>
        )}
      </div>

      {/* Estado: não conectado -------------------------------------------------*/}
      {semConexao ? (
        <div className="rounded-xl bg-wave-50 border border-wave-100 p-4 text-sm text-wave-600">
          <p className="mb-3">
            O Fundo de Reserva ainda não está conectado ao Open Finance.
            {podeGerenciar
              ? ' Autorize o acesso somente-leitura para exibir o saldo do condomínio.'
              : ' Aguarde o síndico autorizar o acesso.'}
          </p>
          {podeGerenciar && (
            <button
              onClick={handleConectar}
              disabled={busy}
              className="w-full min-h-[48px] py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Link2 className="w-5 h-5" />}
              Conectar Open Finance
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Banner de reconexão (consentimento expirado/revogado/erro) ----------*/}
          {reconectar && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Dados possivelmente desatualizados.</p>
                <p>O consentimento do Open Finance expirou ou foi revogado. {podeGerenciar ? 'Reautorize para atualizar.' : 'Peça ao síndico para reautorizar.'}</p>
                {podeGerenciar && (
                  <button onClick={handleConectar} disabled={busy} className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-700 disabled:opacity-60">
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Reautorizar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Valores — só quando confiáveis; senão ficam esmaecidos como "não atuais" */}
          <div className={temValores ? '' : 'opacity-50'}>
            <div className="mb-4">
              <p className="text-wave-500 text-xs mb-1">Total do Fundo de Reserva</p>
              <p className="text-3xl font-semibold text-wave-800">{formatFundo(view.total)}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-wave-50 border border-wave-100 p-3">
                <div className="flex items-center gap-1.5 text-wave-500 text-xs mb-1">
                  <Landmark className="w-3.5 h-3.5" /> Disponível no banco
                </div>
                <p className="text-wave-800 font-medium">{formatFundo(view.saldoDisponivel)}</p>
              </div>
              <div className="rounded-xl bg-wave-50 border border-wave-100 p-3">
                <div className="flex items-center gap-1.5 text-wave-500 text-xs mb-1">
                  <TrendingUp className="w-3.5 h-3.5" /> Investido
                </div>
                <p className="text-wave-800 font-medium">{formatFundo(view.valorInvestido)}</p>
              </div>
            </div>
          </div>

          {/* Rodapé: última atualização + selo verificável + ações --------------*/}
          <div className="mt-4 pt-4 border-t border-wave-50 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-wave-500">
              <span>Última atualização: {fmtDataHora(view.consultadoEm)}</span>
              {temValores && desatualizado && <span className="ml-2 text-amber-600">(desatualizado)</span>}
              <div className="mt-1">
                {view.txHash ? (
                  <a
                    href={view.explorerUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-brand-teal hover:underline"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" /> Snapshot verificado on-chain <ExternalLink className="w-3 h-3" />
                  </a>
                ) : view.hash ? (
                  <span className="inline-flex items-center gap-1 text-wave-500">
                    <ShieldCheck className="w-3.5 h-3.5" /> Registro gerado
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAtualizar}
                disabled={busy || reconectar}
                title={reconectar ? 'Reautorize o Open Finance para atualizar' : 'Atualizar agora'}
                className="inline-flex items-center gap-1.5 px-3 min-h-[40px] py-2 bg-wave-100 text-wave-700 rounded-xl text-sm hover:bg-wave-200 disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Atualizar
              </button>
              {podeGerenciar && !reconectar && (
                <button
                  onClick={desconectar}
                  disabled={busy}
                  className="px-3 min-h-[40px] py-2 text-wave-500 rounded-xl text-sm hover:bg-wave-50 disabled:opacity-50"
                >
                  Desconectar
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {error && !semConexao && <p className="mt-3 text-xs text-red-600">{error}</p>}
    </div>
  );
}
