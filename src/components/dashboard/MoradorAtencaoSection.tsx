'use client';

// ---------------------------------------------------------------------------
// src/components/dashboard/MoradorAtencaoSection.tsx
//
// Seção "Atenção Necessária" do Morador (MOR-015).
//
// Mostra, no topo do painel do morador, apenas o que exige a atenção DELE:
// comunicados urgentes/importantes do condomínio + solicitações da sua
// unidade que estão em aberto/andamento. A seleção e a ordenação vivem em
// moradorAtencao.ts (lógica pura, testada); este componente é só apresentação
// e é somente leitura — cada item leva (via link) à seção de origem.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { AlertTriangle, Megaphone, ClipboardList, ChevronRight } from 'lucide-react';

import { selectAtencaoItems, type AtencaoItem, type AtencaoNivel } from './moradorAtencao';
import { formatData } from '../communication/avisoUtils';
import type { Aviso } from '../communication/types';
import type { SolicitacaoServico } from './moradorDashboardTypes';

interface MoradorAtencaoSectionProps {
  comunicados: Aviso[];
  solicitacoes: SolicitacaoServico[];
  /** Máximo de itens exibidos (os demais ficam nas seções de origem). */
  max?: number;
}

const NIVEL_BADGE: Record<AtencaoNivel, { label: string; className: string }> = {
  urgente: { label: 'Urgente', className: 'bg-red-50 text-red-700 border-red-200' },
  alta: { label: 'Importante', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  media: { label: 'Acompanhar', className: 'bg-wave-50 text-wave-600 border-wave-200' },
};

function ItemIcon({ tipo }: { tipo: AtencaoItem['tipo'] }) {
  const Icon = tipo === 'comunicado' ? Megaphone : ClipboardList;
  return <Icon className="h-4 w-4 text-wave-500" aria-hidden="true" />;
}

export function MoradorAtencaoSection({
  comunicados,
  solicitacoes,
  max = 5,
}: MoradorAtencaoSectionProps) {
  const items = selectAtencaoItems({ comunicados, solicitacoes });
  const visiveis = items.slice(0, max);
  const restantes = items.length - visiveis.length;

  return (
    <section
      aria-labelledby="morador-atencao-title"
      className="rounded-2xl border border-wave-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-amber-100 p-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 id="morador-atencao-title" className="text-wave-800">
            Atenção Necessária
            {items.length > 0 && (
              <span className="ml-1 text-sm text-wave-400">({items.length})</span>
            )}
          </h2>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-wave-400">
          Nada exige sua atenção no momento. Você está em dia.
        </p>
      ) : (
        <>
          <ul className="space-y-3">
            {visiveis.map((item) => {
              const badge = NIVEL_BADGE[item.nivel];
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-xl border border-wave-100 p-3 transition-colors hover:border-wave-300 hover:bg-wave-50/60"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 shrink-0">
                        <ItemIcon tipo={item.tipo} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-wave-800">{item.titulo}</p>
                        <p className="mt-0.5 text-xs text-wave-500">
                          {item.descricao} • {formatData(item.data)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-wave-300" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {restantes > 0 && (
            <p className="mt-3 text-center text-xs text-wave-400">
              +{restantes} {restantes === 1 ? 'outro item' : 'outros itens'} nas seções abaixo
            </p>
          )}
        </>
      )}
    </section>
  );
}
