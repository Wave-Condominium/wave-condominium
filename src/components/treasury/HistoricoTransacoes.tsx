'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/HistoricoTransacoes.tsx
//
// Seção "Histórico de Transações" (MOR-053) — extrato único e cronológico das
// RECEITAS e DESPESAS do condomínio. SOMENTE LEITURA: sem qualquer controle de
// criação/edição/exclusão. Combina os boletos pagos (receitas) com as despesas
// (MOR-52) via `construirHistorico`.
// ---------------------------------------------------------------------------

import { History, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

import { useFinancialSummary } from '../../hooks/useFinancialSummary';
import { formatBRL, type Despesa } from './despesas';
import { construirHistorico, type Transacao } from './transacoes';

interface HistoricoTransacoesProps {
  despesas: Despesa[];
}

/** ISO (YYYY-MM-DD) → DD/MM/YYYY, sem depender de fuso. */
function formatDataBR(iso: string): string {
  const partes = iso.split('-');
  if (partes.length !== 3) return iso || '—';
  const [ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

export function HistoricoTransacoes({ despesas }: HistoricoTransacoesProps) {
  const { boletos } = useFinancialSummary();

  const historico = construirHistorico(boletos, despesas);

  return (
    <section
      aria-labelledby="historico-title"
      className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg relative z-10"
    >
      <div className="p-6 border-b border-wave-100 flex items-center gap-2">
        <div className="p-2 bg-wave-100 rounded-lg">
          <History className="w-5 h-5 text-wave-600" aria-hidden="true" />
        </div>
        <div>
          <h3 id="historico-title" className="text-wave-800 text-lg">Histórico de Transações</h3>
          <p className="text-wave-500 text-sm">Receitas e despesas do condomínio, das mais recentes às mais antigas.</p>
        </div>
      </div>

      {historico.length === 0 ? (
        <p className="py-10 text-center text-sm text-wave-400">
          Nenhuma movimentação financeira registrada ainda.
        </p>
      ) : (
        <>
          {/* Desktop/tablet: tabela com rolagem horizontal segura */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-wave-50 border-b border-wave-100">
                <tr>
                  <th className="px-6 py-4 text-left text-sm text-wave-500">Tipo</th>
                  <th className="px-6 py-4 text-left text-sm text-wave-500">Data</th>
                  <th className="px-6 py-4 text-left text-sm text-wave-500">Descrição</th>
                  <th className="px-6 py-4 text-left text-sm text-wave-500">Categoria</th>
                  <th className="px-6 py-4 text-right text-sm text-wave-500">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wave-50">
                {historico.map((t) => (
                  <tr key={t.id} className="hover:bg-wave-50/50 transition-colors">
                    <td className="px-6 py-4"><TipoBadge tipo={t.tipo} /></td>
                    <td className="px-6 py-4 text-wave-500 text-sm whitespace-nowrap">{formatDataBR(t.data)}</td>
                    <td className="px-6 py-4">
                      <p className="text-wave-800">{t.descricao}</p>
                      {t.origem && <p className="text-xs text-wave-400 mt-0.5">Origem: {t.origem}</p>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 rounded-full text-xs bg-wave-100 text-wave-600">{t.categoria}</span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap"><Valor t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: lista em cartões */}
          <ul className="sm:hidden divide-y divide-wave-50">
            {historico.map((t) => (
              <li key={t.id} className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <TipoBadge tipo={t.tipo} />
                    <span className="text-xs text-wave-400">{formatDataBR(t.data)}</span>
                  </div>
                  <p className="text-wave-800 text-sm truncate">{t.descricao}</p>
                  <p className="text-xs text-wave-500 mt-0.5">
                    {t.categoria}{t.origem ? ` · ${t.origem}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right"><Valor t={t} /></div>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="text-wave-400 text-xs italic px-6 py-4">
        * Extrato de caixa: receitas vêm dos boletos pagos e despesas das despesas pagas.
        Consulta apenas — a gestão financeira é do Síndico/Administradora.
      </p>
    </section>
  );
}

function TipoBadge({ tipo }: { tipo: Transacao['tipo'] }) {
  const isReceita = tipo === 'receita';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs ${
        isReceita ? 'bg-brand-teal/15 text-brand-teal' : 'bg-orange-100 text-orange-700'
      }`}
    >
      {isReceita ? (
        <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <ArrowDownCircle className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {isReceita ? 'Receita' : 'Despesa'}
    </span>
  );
}

function Valor({ t }: { t: Transacao }) {
  const isReceita = t.tipo === 'receita';
  return (
    <span className={`text-sm font-medium ${isReceita ? 'text-brand-teal' : 'text-orange-600'}`}>
      {isReceita ? '+' : '−'} {formatBRL(t.valor)}
    </span>
  );
}
