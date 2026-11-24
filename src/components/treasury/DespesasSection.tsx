'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/DespesasSection.tsx
//
// Seção "Despesas" do financeiro (MOR-52) — posicionada abaixo de Receitas.
//
// SOMENTE LEITURA: mostra o total das despesas do período, a quebra por
// categoria e um gráfico (pizza) da distribuição, para dar transparência ao
// Morador sobre para onde vão os recursos do condomínio. Não há nenhum
// controle de criação/edição/exclusão — lançamento de despesas será uma tela
// de gestão (Síndico/Administradora), em card próprio.
// ---------------------------------------------------------------------------

import { TrendingDown, PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

import { formatBRL, totalDespesas, agruparPorCategoria, type Despesa } from './despesas';

interface DespesasSectionProps {
  despesas: Despesa[];
  /** Rótulo do período (ex.: "Ago") — exibido junto ao título, como em Receitas. */
  periodoLabel?: string;
}

export function DespesasSection({ despesas, periodoLabel }: DespesasSectionProps) {
  // A distribuição reflete os recursos que efetivamente saíram (despesas
  // PAGAS), no mesmo espírito das receitas (boletos pagos).
  const pagas = despesas.filter((d) => d.status === 'PAGO');
  const total = totalDespesas(pagas);
  const porCategoria = agruparPorCategoria(pagas);

  return (
    <section
      aria-labelledby="despesas-title"
      className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-wave-100 shadow-lg mb-8 relative z-10"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-100 rounded-lg">
            <TrendingDown className="w-5 h-5 text-orange-600" aria-hidden="true" />
          </div>
          <h2 id="despesas-title" className="text-wave-800 text-lg">
            Despesas {periodoLabel ? `(${periodoLabel})` : ''}
          </h2>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-wave-500 text-sm">Total no período</p>
          <p className="text-orange-600 text-2xl font-semibold">{formatBRL(total)}</p>
        </div>
      </div>

      {porCategoria.length === 0 ? (
        <p className="py-8 text-center text-sm text-wave-400">
          Nenhuma despesa paga registrada até o momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Quebra por categoria */}
          <div>
            <ul className="space-y-3">
              {porCategoria.map((c) => (
                <li key={c.categoria}>
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: c.cor }}
                        aria-hidden="true"
                      />
                      <span className="text-sm text-wave-700 truncate">{c.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm text-wave-800">{formatBRL(c.valor)}</span>
                      <span className="text-xs text-wave-400 w-9 text-right">{c.percentual}%</span>
                    </div>
                  </div>
                  {/* Barra proporcional — reforça a leitura sem depender só de cor */}
                  <div className="w-full bg-wave-100 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${c.percentual}%`, backgroundColor: c.cor }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Gráfico de distribuição por categoria */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-wave-500">
              <PieChartIcon className="w-4 h-4" aria-hidden="true" />
              <span className="text-sm">Distribuição por categoria</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={porCategoria}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="valor"
                  nameKey="label"
                >
                  {porCategoria.map((c) => (
                    <Cell key={c.categoria} fill={c.cor} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, entry) => [
                    formatBRL(value),
                    (entry?.payload as { label?: string })?.label ?? '',
                  ]}
                  contentStyle={{ backgroundColor: 'white', border: '2px solid #f59e0b', borderRadius: '12px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <p className="text-wave-400 text-xs italic mt-4">
        * Distribuição das despesas efetivamente pagas do condomínio. O registro e o
        acompanhamento (Síndico/Administradora) ficam na seção “Gestão de Despesas”.
      </p>
    </section>
  );
}
