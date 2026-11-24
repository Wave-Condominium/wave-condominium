'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/MinhasReceitasCard.tsx  —  MOR-057
//
// Visão do Morador das receitas da própria cota condominial: cota paga, valor,
// data do pagamento e status de contabilização, com histórico mensal. A receita
// nasce da confirmação do PSP (webhook) — não do Open Finance.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Receipt, CheckCircle, Loader2, AlertCircle } from 'lucide-react';

import { listMinhasReceitasAction } from '@/app/actions/receitas';
import {
  agruparPorMes,
  totalContabilizado,
  formatReceita,
  formatMesReferencia,
  STATUS_CONTABILIZACAO_LABEL,
  STATUS_CONTABILIZACAO_COR,
  type Receita,
} from '@/components/treasury/receitas';

function fmtData(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export function MinhasReceitasCard() {
  const [receitas, setReceitas] = useState<Receita[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listMinhasReceitasAction()
      .then((r) => { if (alive) { setReceitas(r); setError(null); } })
      .catch(() => { if (alive) setError('Não foi possível carregar suas receitas.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="h-48 rounded-2xl bg-wave-100 animate-pulse" aria-busy="true" />;

  const meses = agruparPorMes(receitas);
  const total = totalContabilizado(receitas);

  return (
    <div className="bg-white rounded-2xl border border-wave-100 shadow-lg p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-brand-teal/15 shrink-0">
          <Receipt className="w-5 h-5 text-brand-teal" />
        </div>
        <div className="min-w-0">
          <h3 className="text-wave-800 font-semibold">Minhas Receitas (cotas pagas)</h3>
          <p className="text-wave-400 text-xs">Confirmadas pelo PSP/Gateway e contabilizadas.</p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-wave-50 border border-wave-100 p-4 text-sm text-wave-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-500" /> {error}
        </div>
      ) : receitas.length === 0 ? (
        <div className="rounded-xl bg-wave-50 border border-wave-100 p-4 text-sm text-wave-600">
          Nenhuma cota contabilizada ainda. Assim que um pagamento for confirmado pelo banco/gateway,
          ele aparece aqui.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-wave-500 text-xs mb-1">Total contabilizado</p>
            <p className="text-2xl font-semibold text-wave-800">{formatReceita(total)}</p>
          </div>

          <ul className="divide-y divide-wave-50">
            {receitas.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-wave-800">
                    Cota {formatMesReferencia(r.referenceMonth)} — {formatReceita(r.valor)}
                  </p>
                  <p className="text-xs text-wave-500">
                    Pago em {fmtData(r.dataPagamento)} · Unidade {r.unitNumber}
                    {r.divergenciaMotivo ? ` · ${r.divergenciaMotivo}` : ''}
                  </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CONTABILIZACAO_COR[r.status]}`}>
                  {r.status === 'CONTABILIZADA' && <CheckCircle className="w-3.5 h-3.5" />}
                  {STATUS_CONTABILIZACAO_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>

          {meses.length > 1 && (
            <div className="mt-4 pt-4 border-t border-wave-50">
              <p className="text-wave-500 text-xs mb-2">Histórico mensal</p>
              <div className="flex flex-wrap gap-2">
                {meses.map((m) => (
                  <span key={m.mes} className="inline-flex items-center gap-1 rounded-lg bg-wave-50 border border-wave-100 px-2.5 py-1 text-xs text-wave-700">
                    {formatMesReferencia(m.mes)}: {formatReceita(m.total)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
