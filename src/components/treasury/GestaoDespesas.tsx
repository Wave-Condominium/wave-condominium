'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/GestaoDespesas.tsx
//
// Gestão de Despesas (SÍN-011) — EXCLUSIVO de gestor. Permite registrar,
// acompanhar e consultar as despesas do condomínio: lista com status
// (Pendente/Pago/Vencido — este derivado), filtros, registro de pagamento e
// verificação de integridade do comprovante (âncora Stellar).
//
// Estados tratados: carregando, erro, vazio. Restrição de acesso é estrutural
// (renderizado só para gestor) e revalidada no servidor.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';
import {
  Receipt, Plus, ShieldCheck, ShieldAlert, ShieldQuestion, FileText,
  ExternalLink, Loader2, CircleDollarSign, AlertTriangle, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_LABEL,
  STATUS_DESPESA_LABEL,
  formatBRL,
  statusView,
  despesaPodePagar,
  type CategoriaDespesa,
  type StatusDespesaView,
  type Despesa,
} from './despesas';
import { RegistrarPagamentoModal } from './RegistrarPagamentoModal';
import {
  verificarComprovanteDespesaAction,
  type RegistrarPagamentoActionInput,
  type DespesaResult,
  type VerificacaoComprovante,
} from '@/app/actions/despesas';

interface GestaoDespesasProps {
  despesas: Despesa[];
  loading: boolean;
  error: string | null;
  onNovaDespesa: () => void;
  onRegistrarPagamento: (id: string, input: RegistrarPagamentoActionInput) => Promise<DespesaResult>;
}

type FiltroStatus = 'TODAS' | StatusDespesaView;

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function formatDataBR(iso?: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export function GestaoDespesas({
  despesas, loading, error, onNovaDespesa, onRegistrarPagamento,
}: GestaoDespesasProps) {
  const hoje = hojeISO();
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('TODAS');
  const [filtroCategoria, setFiltroCategoria] = useState<'TODAS' | CategoriaDespesa>('TODAS');
  const [pagando, setPagando] = useState<Despesa | null>(null);

  // Verificação de integridade por despesa (id -> estado).
  const [verificacoes, setVerificacoes] = useState<Record<string, VerificacaoComprovante | 'loading'>>({});

  const comStatus = useMemo(
    () => despesas.map((d) => ({ d, sv: statusView(d, hoje) })),
    [despesas, hoje],
  );

  const tiles = useMemo(() => {
    let pendentes = 0, totalPendente = 0, vencidas = 0, totalVencido = 0, pagas = 0, totalPago = 0;
    for (const { d, sv } of comStatus) {
      if (sv === 'PAGO') { pagas++; totalPago += d.valor; }
      else if (sv === 'VENCIDO') { vencidas++; totalVencido += d.valor; }
      else { pendentes++; totalPendente += d.valor; }
    }
    return { pendentes, totalPendente, vencidas, totalVencido, pagas, totalPago };
  }, [comStatus]);

  const linhas = useMemo(() => {
    return comStatus.filter(({ d, sv }) => {
      if (filtroStatus !== 'TODAS' && sv !== filtroStatus) return false;
      if (filtroCategoria !== 'TODAS' && d.categoria !== filtroCategoria) return false;
      return true;
    });
  }, [comStatus, filtroStatus, filtroCategoria]);

  async function verificar(d: Despesa) {
    setVerificacoes((v) => ({ ...v, [d.id]: 'loading' }));
    try {
      const res = await verificarComprovanteDespesaAction(d.id);
      setVerificacoes((v) => ({ ...v, [d.id]: res }));
      if (!res.ok) toast.error(res.error);
      else if (res.resultado === 'integra') toast.success('Comprovante íntegro — confere com o registro.');
      else if (res.resultado === 'alterada') toast.error('Atenção: o comprovante NÃO confere com o registro.');
      else toast.message('Sem registro de integridade para este comprovante.');
    } catch {
      setVerificacoes((v) => ({ ...v, [d.id]: { ok: false, error: 'Falha ao verificar.' } }));
      toast.error('Não foi possível verificar o comprovante.');
    }
  }

  return (
    <section
      aria-labelledby="gestao-despesas-title"
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg mb-8 relative z-10"
    >
      {/* Cabeçalho */}
      <div className="p-6 border-b border-wave-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
            <Receipt className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 id="gestao-despesas-title" className="text-wave-800 text-lg">Gestão de Despesas</h3>
            <p className="text-wave-500 text-sm">Registre, acompanhe e consulte as despesas do condomínio</p>
          </div>
        </div>
        <button
          onClick={onNovaDespesa}
          className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nova Despesa
        </button>
      </div>

      <div className="p-6">
        {/* Tiles de resumo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-orange-200 rounded-lg"><FileText className="w-5 h-5 text-orange-700" /></div>
              <span className="text-2xl text-orange-900">{tiles.pendentes}</span>
            </div>
            <h4 className="text-orange-900">Pendentes</h4>
            <p className="text-orange-700 text-sm">{formatBRL(tiles.totalPendente)} a pagar</p>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-red-200 rounded-lg"><AlertTriangle className="w-5 h-5 text-red-700" /></div>
              <span className="text-2xl text-red-900">{tiles.vencidas}</span>
            </div>
            <h4 className="text-red-900">Vencidas</h4>
            <p className="text-red-700 text-sm">{formatBRL(tiles.totalVencido)} em atraso</p>
          </div>
          <div className="bg-gradient-to-br from-brand-teal/10 to-brand-teal/15 rounded-xl p-4 border border-brand-teal/30">
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 bg-brand-teal/20 rounded-lg"><Wallet className="w-5 h-5 text-brand-teal" /></div>
              <span className="text-2xl text-brand-navy">{tiles.pagas}</span>
            </div>
            <h4 className="text-brand-navy">Pagas</h4>
            <p className="text-brand-teal text-sm">{formatBRL(tiles.totalPago)} liquidados</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1">
            <label htmlFor="flt-status" className="sr-only">Filtrar por status</label>
            <select
              id="flt-status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
              className="w-full px-4 py-2.5 bg-wave-50 border border-wave-200 rounded-xl text-wave-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="TODAS">Todos os status</option>
              <option value="AGUARDANDO_APROVACAO">Aguardando aprovação</option>
              <option value="PENDENTE">Pendentes</option>
              <option value="VENCIDO">Vencidas</option>
              <option value="PAGO">Pagas</option>
              <option value="REPROVADA">Reprovadas</option>
            </select>
          </div>
          <div className="flex-1">
            <label htmlFor="flt-cat" className="sr-only">Filtrar por categoria</label>
            <select
              id="flt-cat"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value as 'TODAS' | CategoriaDespesa)}
              className="w-full px-4 py-2.5 bg-wave-50 border border-wave-200 rounded-xl text-wave-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="TODAS">Todas as categorias</option>
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c} value={c}>{CATEGORIA_DESPESA_LABEL[c]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Conteúdo: loading / erro / vazio / lista */}
        {loading ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-wave-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <AlertTriangle className="w-6 h-6 text-orange-500 mx-auto mb-2" />
            <p className="text-wave-600 text-sm">{error}</p>
          </div>
        ) : linhas.length === 0 ? (
          <div className="py-10 text-center">
            <Receipt className="w-8 h-8 text-wave-300 mx-auto mb-2" />
            <p className="text-wave-600 text-sm">
              {despesas.length === 0
                ? 'Nenhuma despesa registrada ainda. Clique em “Nova Despesa” para começar.'
                : 'Nenhuma despesa corresponde aos filtros selecionados.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop/tablet */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-wave-50 border-b border-wave-100">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm text-wave-500">Descrição</th>
                    <th className="px-4 py-3 text-left text-sm text-wave-500">Categoria</th>
                    <th className="px-4 py-3 text-left text-sm text-wave-500">Vencimento</th>
                    <th className="px-4 py-3 text-right text-sm text-wave-500">Valor</th>
                    <th className="px-4 py-3 text-left text-sm text-wave-500">Status</th>
                    <th className="px-4 py-3 text-left text-sm text-wave-500">Comprovante</th>
                    <th className="px-4 py-3 text-right text-sm text-wave-500">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wave-50">
                  {linhas.map(({ d, sv }) => (
                    <tr key={d.id} className="hover:bg-wave-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-wave-800">{d.descricao}</p>
                        {d.fornecedor && <p className="text-xs text-wave-400 mt-0.5">{d.fornecedor}</p>}
                      </td>
                      <td className="px-4 py-3 text-wave-600 text-sm">{CATEGORIA_DESPESA_LABEL[d.categoria]}</td>
                      <td className="px-4 py-3 text-wave-500 text-sm whitespace-nowrap">{formatDataBR(d.dataVencimento)}</td>
                      <td className="px-4 py-3 text-right text-wave-800 whitespace-nowrap">{formatBRL(d.valor)}</td>
                      <td className="px-4 py-3"><StatusBadge sv={sv} /></td>
                      <td className="px-4 py-3"><ComprovanteCell d={d} estado={verificacoes[d.id]} onVerificar={() => verificar(d)} /></td>
                      <td className="px-4 py-3 text-right">
                        {despesaPodePagar(sv) && (
                          <button
                            onClick={() => setPagando(d)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 transition-colors text-sm"
                          >
                            <CircleDollarSign className="w-4 h-4" />
                            Pagar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <ul className="md:hidden divide-y divide-wave-50">
              {linhas.map(({ d, sv }) => (
                <li key={d.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-wave-800 text-sm truncate">{d.descricao}</p>
                      <p className="text-xs text-wave-400 mt-0.5">
                        {CATEGORIA_DESPESA_LABEL[d.categoria]}{d.fornecedor ? ` · ${d.fornecedor}` : ''}
                      </p>
                      <p className="text-xs text-wave-400 mt-0.5">Vence em {formatDataBR(d.dataVencimento)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-wave-800">{formatBRL(d.valor)}</p>
                      <div className="mt-1"><StatusBadge sv={sv} /></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 gap-2">
                    <ComprovanteCell d={d} estado={verificacoes[d.id]} onVerificar={() => verificar(d)} />
                    {sv !== 'PAGO' && (
                      <button
                        onClick={() => setPagando(d)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 transition-colors text-sm"
                      >
                        <CircleDollarSign className="w-4 h-4" />
                        Pagar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {pagando && (
        <RegistrarPagamentoModal
          despesa={pagando}
          onClose={() => setPagando(null)}
          onConfirm={onRegistrarPagamento}
        />
      )}
    </section>
  );
}

function StatusBadge({ sv }: { sv: StatusDespesaView }) {
  const styles: Record<StatusDespesaView, string> = {
    PENDENTE: 'bg-orange-100 text-orange-700',
    PAGO: 'bg-brand-teal/15 text-brand-teal',
    AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-700',
    REPROVADA: 'bg-red-100 text-red-700',
    VENCIDO: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs ${styles[sv]}`}>
      {STATUS_DESPESA_LABEL[sv]}
    </span>
  );
}

function ComprovanteCell({
  d, estado, onVerificar,
}: {
  d: Despesa;
  estado: VerificacaoComprovante | 'loading' | undefined;
  onVerificar: () => void;
}) {
  if (!d.comprovanteUrl) {
    return <span className="text-xs text-wave-400">—</span>;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={d.comprovanteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
      >
        <ExternalLink className="w-3.5 h-3.5" /> Ver
      </a>
      {estado === 'loading' ? (
        <span className="inline-flex items-center gap-1 text-wave-500 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando…
        </span>
      ) : estado && estado.ok ? (
        <IntegridadeBadge resultado={estado.resultado} explorerUrl={estado.explorerUrl} />
      ) : (
        <button onClick={onVerificar} className="inline-flex items-center gap-1 text-wave-600 hover:text-wave-800 text-xs">
          <ShieldQuestion className="w-3.5 h-3.5" /> Verificar
        </button>
      )}
    </div>
  );
}

function IntegridadeBadge({
  resultado, explorerUrl,
}: {
  resultado: 'integra' | 'alterada' | 'sem_registro';
  explorerUrl?: string;
}) {
  if (resultado === 'integra') {
    return (
      <span className="inline-flex items-center gap-1 text-brand-teal text-xs">
        <ShieldCheck className="w-3.5 h-3.5" /> Íntegro
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">ledger</a>
        )}
      </span>
    );
  }
  if (resultado === 'alterada') {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 text-xs">
        <ShieldAlert className="w-3.5 h-3.5" /> Alterado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-wave-400 text-xs">
      <ShieldQuestion className="w-3.5 h-3.5" /> Sem registro
    </span>
  );
}
