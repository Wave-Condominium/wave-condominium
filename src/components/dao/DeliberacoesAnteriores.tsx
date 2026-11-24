'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Eye, Archive } from 'lucide-react';

import {
  type GovernanceConfig,
  type Proposta,
  apurar,
  formatData,
  motivoRejeicao,
  statusFila,
  CATEGORIA_LABEL,
} from './governanceCore';
import { StatusFilaBadge } from './StatusBadge';

interface DeliberacoesAnterioresProps {
  aprovadas: Proposta[];
  rejeitadas: Proposta[];
  config: GovernanceConfig;
  onVerDetalhes: (id: string) => void;
}

/**
 * Historico permanente das propostas ja finalizadas, em duas abas:
 * "Aprovadas em Primeira Fase" e "Rejeitadas".
 */
export function DeliberacoesAnteriores({ aprovadas, rejeitadas, config, onVerDetalhes }: DeliberacoesAnterioresProps) {
  const [aba, setAba] = useState<'aprovadas' | 'rejeitadas'>('aprovadas');

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-2 rounded-2xl border border-wave-100 bg-white/80 p-2 shadow-sm backdrop-blur-sm">
        <SubTab active={aba === 'aprovadas'} onClick={() => setAba('aprovadas')} label={`Aprovadas em Primeira Fase (${aprovadas.length})`} />
        <SubTab active={aba === 'rejeitadas'} onClick={() => setAba('rejeitadas')} label={`Rejeitadas (${rejeitadas.length})`} />
      </div>

      {aba === 'aprovadas' ? (
        aprovadas.length === 0 ? (
          <Empty texto="Nenhuma proposta aprovada na primeira fase ainda." />
        ) : (
          <div className="space-y-3">
            {aprovadas.map((p) => {
              const ap = apurar(p);
              return (
                <Card key={p.id} onVer={() => onVerDetalhes(p.id)}>
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-brand-teal" />
                    <h4 className="text-wave-800">{p.titulo}</h4>
                    <Chip>{CATEGORIA_LABEL[p.categoria]}</Chip>
                    <StatusFilaBadge status={statusFila(p)} />
                  </div>
                  <p className="text-xs text-wave-500">
                    Votacao encerrada em {formatData(p.encerradaEm)} • {ap.percentAprovacao}% de aprovacao • {ap.total} votos
                  </p>
                </Card>
              );
            })}
          </div>
        )
      ) : rejeitadas.length === 0 ? (
        <Empty texto="Nenhuma proposta rejeitada ate o momento." />
      ) : (
        <div className="space-y-3">
          {rejeitadas.map((p) => {
            const ap = apurar(p);
            return (
              <Card key={p.id} onVer={() => onVerDetalhes(p.id)}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-600" />
                  <h4 className="text-wave-800">{p.titulo}</h4>
                  <Chip>{CATEGORIA_LABEL[p.categoria]}</Chip>
                </div>
                <p className="text-xs text-wave-500">
                  {p.rejeitadaPor
                    ? `Rejeitada por ${p.rejeitadaPor} em ${formatData(p.rejeitadaEm ?? p.encerradaEm)}`
                    : `Votacao encerrada em ${formatData(p.encerradaEm)} • ${ap.percentReprovacao}% de reprovacao • ${ap.total} votos`}
                </p>
                <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Motivo: {p.motivoRejeicao ?? motivoRejeicao(config)}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SubTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm transition-all ${
        active ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow' : 'text-wave-500 hover:bg-wave-50'
      }`}
    >
      {label}
    </button>
  );
}

function Card({ children, onVer }: { children: React.ReactNode; onVer: () => void }) {
  return (
    <div className="rounded-2xl border border-wave-100 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          onClick={onVer}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-wave-50 px-4 py-2 text-sm text-wave-600 transition-colors hover:bg-wave-100"
        >
          <Eye className="h-4 w-4" /> Ver detalhes
        </button>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-wave-50 px-2.5 py-0.5 text-xs text-wave-600">{children}</span>;
}

function Empty({ texto }: { texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-wave-200 bg-white/70 px-6 py-12 text-center backdrop-blur-sm">
      <Archive className="mb-3 h-9 w-9 text-wave-300" aria-hidden="true" />
      <p className="text-sm text-wave-500">{texto}</p>
    </div>
  );
}
