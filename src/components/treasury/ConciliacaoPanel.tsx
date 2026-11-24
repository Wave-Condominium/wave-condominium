'use client';

import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, Scale } from 'lucide-react';

import { listBoletosAction } from '@/app/actions/boletos';
import type { BoletoFull } from '../boletos/boletoTypes';
import {
  conciliar,
  isBoletoLiquidado,
  lancamentosDeBoletos,
  DIVERGENCIA_LABEL,
  type ItemConciliacao,
} from './conciliacao';

function formatBRL(v: number): string {
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDataBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function refBoleto(id?: string): string {
  return id ? `#${id.slice(-6)}` : '—';
}

/**
 * SÍN-010 — Conciliação Boletos × Tesouraria.
 *
 * Fonte única de verdade: o boleto (banco). Cada boleto liquidado projeta
 * exatamente uma receita na Tesouraria. Este painel roda a rotina de
 * conciliação, sinaliza visualmente e lista os itens não conciliados.
 */
export function ConciliacaoPanel() {
  const [boletos, setBoletos] = useState<BoletoFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [soDivergentes, setSoDivergentes] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const lista = await listBoletosAction();
      setBoletos(lista);
    } catch (err) {
      console.error('Falha ao carregar boletos para conciliação', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    listBoletosAction()
      .then((lista) => { if (alive) setBoletos(lista); })
      .catch((err) => console.error('Falha ao carregar boletos para conciliação', err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const resultado = useMemo(() => {
    const liquidados = boletos.filter(isBoletoLiquidado);
    // Fonte única: os lançamentos derivam dos mesmos boletos liquidados do banco.
    return conciliar(liquidados, lancamentosDeBoletos(boletos));
  }, [boletos]);

  const linhas: ItemConciliacao[] = soDivergentes ? resultado.naoConciliados : resultado.itens;
  const temDivergencia = resultado.totalDivergentes > 0;

  return (
    <div className="relative z-10 mb-8 rounded-2xl border border-wave-100 bg-white/80 shadow-lg backdrop-blur-sm">
      <div className="flex flex-col gap-3 border-b border-wave-100 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-brand-deep to-brand-steel p-2">
            <Scale className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg text-wave-800">Conciliação Boletos × Tesouraria</h3>
            <p className="text-sm text-wave-500">Cada boleto liquidado gera exatamente uma receita — sem duplicidade.</p>
          </div>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-wave-200 bg-white px-4 py-2.5 text-sm text-wave-600 transition-colors hover:bg-wave-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Reconciliar
        </button>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="rounded-xl border border-wave-100 bg-white p-8 text-center text-sm text-wave-500">
            Carregando conciliação...
          </div>
        ) : (
          <>
            {/* Alerta visual */}
            {temDivergencia ? (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-900">
                    {resultado.totalDivergentes} {resultado.totalDivergentes === 1 ? 'item não conciliado' : 'itens não conciliados'}
                  </p>
                  <p className="text-sm text-amber-700">
                    Existem divergências entre Boletos e Tesouraria. Verifique os itens sinalizados abaixo.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-teal" />
                <div>
                  <p className="font-medium text-brand-navy">Tudo conciliado</p>
                  <p className="text-sm text-brand-teal">
                    {resultado.totalBoletosLiquidados} {resultado.totalBoletosLiquidados === 1 ? 'boleto liquidado gerou' : 'boletos liquidados geraram'}{' '}
                    {resultado.totalLancamentos} {resultado.totalLancamentos === 1 ? 'receita' : 'receitas'} na Tesouraria, sem divergências.
                  </p>
                </div>
              </div>
            )}

            {/* Filtro */}
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-wave-500">
                {resultado.totalConciliados} conciliados · {resultado.totalDivergentes} divergentes
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-wave-600">
                <input
                  type="checkbox"
                  checked={soDivergentes}
                  onChange={(e) => setSoDivergentes(e.target.checked)}
                  className="h-4 w-4 rounded accent-brand-steel"
                />
                Só não conciliados
              </label>
            </div>

            {/* Relatório de itens */}
            {linhas.length === 0 ? (
              <div className="rounded-xl border border-dashed border-wave-200 bg-white/70 p-8 text-center text-sm text-wave-500">
                {soDivergentes ? 'Nenhuma divergência encontrada.' : 'Nenhum boleto liquidado até o momento.'}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-wave-100">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-wave-50 text-xs uppercase tracking-wide text-wave-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Boleto</th>
                      <th className="px-4 py-3 font-medium">Unidade</th>
                      <th className="px-4 py-3 font-medium">Valor</th>
                      <th className="px-4 py-3 font-medium">Data liquidação</th>
                      <th className="px-4 py-3 font-medium">Situação boleto</th>
                      <th className="px-4 py-3 font-medium">Situação Tesouraria</th>
                      <th className="px-4 py-3 font-medium">Divergência</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-wave-100">
                    {linhas.map((item) => (
                      <tr key={item.chave} className={item.status === 'divergente' ? 'bg-amber-50/50' : ''}>
                        <td className="px-4 py-3 font-mono text-wave-700">{refBoleto(item.boletoId)}</td>
                        <td className="px-4 py-3 text-wave-700">{item.unidade}</td>
                        <td className="px-4 py-3 font-mono text-wave-800">{formatBRL(item.valor)}</td>
                        <td className="px-4 py-3 text-wave-700">{formatDataBR(item.dataLiquidacao)}</td>
                        <td className="px-4 py-3 text-wave-700">{item.situacaoBoleto}</td>
                        <td className="px-4 py-3 text-wave-700">{item.situacaoTesouraria}</td>
                        <td className="px-4 py-3">
                          {item.divergencias.length === 0 ? (
                            <span className="text-wave-400">—</span>
                          ) : (
                            <span className="text-amber-700">
                              {item.divergencias.map((d) => DIVERGENCIA_LABEL[d]).join('; ')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {item.status === 'conciliado' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/15 px-2.5 py-1 text-xs text-brand-teal">
                              <ShieldCheck className="h-3.5 w-3.5" /> Conciliado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-700">
                              <AlertTriangle className="h-3.5 w-3.5" /> Divergente
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
