'use client';

import { ArrowLeft, User, Calendar, Clock, CheckCircle, XCircle, MinusCircle } from 'lucide-react';

import { useEffect, useState } from 'react';

import { listPropostasAction } from '@/app/actions/governanca';
import {
  type Proposta,
  apurar,
  diasRestantes,
  formatData,
  isAprovada,
  isEmVotacao,
  isVotacaoExpirada,
  CATEGORIA_LABEL,
  STATUS_LABEL,
} from './governanceCore';
import { StatusBadge } from './StatusBadge';

interface ProposalDetailsProps {
  proposalId: string;
  onBack: () => void;
}

export function ProposalDetails({ proposalId, onBack }: ProposalDetailsProps) {
  const [proposta, setProposta] = useState<Proposta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listPropostasAction()
      .then(({ propostas }) => {
        if (alive) setProposta(propostas.find((p) => p.id === proposalId) ?? null);
      })
      .catch((err) => console.error('Falha ao carregar proposta', err))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [proposalId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-light p-6">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-wave-700 hover:text-wave-800">
          <ArrowLeft className="h-5 w-5" /> Voltar
        </button>
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-12 text-center text-wave-500 backdrop-blur-sm">
          Carregando proposta...
        </div>
      </div>
    );
  }

  if (!proposta) {
    return (
      <div className="min-h-screen bg-brand-light p-6">
        <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-wave-700 hover:text-wave-800">
          <ArrowLeft className="h-5 w-5" /> Voltar
        </button>
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-12 text-center backdrop-blur-sm">
          <h2 className="text-xl text-wave-800">Proposta nao encontrada</h2>
        </div>
      </div>
    );
  }

  const ap = apurar(proposta);
  const aberta = isEmVotacao(proposta) && !isVotacaoExpirada(proposta);
  const pctBar = (n: number) => (ap.total > 0 ? (n / ap.total) * 100 : 0);
  const resultadoFinal = isAprovada(proposta)
    ? 'Aprovada pela comunidade'
    : proposta.status === 'rejeitada'
      ? 'Rejeitada'
      : 'Votacao em andamento';

  // Etapas percorridas (historico do ciclo de vida).
  const etapas: { label: string; data?: string; done: boolean }[] = [
    { label: 'Proposta criada', data: proposta.criadaEm, done: true },
    { label: 'Votacao aberta (30 dias)', data: proposta.criadaEm, done: true },
    { label: 'Votacao encerrada', data: proposta.encerradaEm, done: Boolean(proposta.encerradaEm) },
    {
      label: isAprovada(proposta) ? 'Aprovada pela comunidade' : proposta.status === 'rejeitada' ? 'Rejeitada' : 'Aguardando resultado',
      data: isAprovada(proposta) ? proposta.aprovadaEm : proposta.rejeitadaEm ?? proposta.aprovadaEm,
      done: !aberta,
    },
    { label: `Situacao atual: ${STATUS_LABEL[proposta.status]}`, done: true },
  ];

  return (
    <div className="min-h-screen bg-brand-light p-4 sm:p-6 lg:p-8">
      <button onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-wave-700 hover:text-wave-800">
        <ArrowLeft className="h-5 w-5" /> Voltar
      </button>

      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={proposta.status} />
            <span className="rounded-full bg-wave-50 px-3 py-1 text-xs text-wave-600">
              {CATEGORIA_LABEL[proposta.categoria]}
            </span>
            {aberta && (
              <span className="inline-flex items-center gap-1 text-xs text-wave-500">
                <Clock className="h-3.5 w-3.5" /> {diasRestantes(proposta)} dias restantes
              </span>
            )}
          </div>

          <h1 className="mb-2 text-2xl text-wave-800">{proposta.titulo}</h1>
          <p className="mb-4 whitespace-pre-wrap text-wave-600">{proposta.descricao}</p>

          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-wave-100 pt-4 text-sm text-wave-500">
            <span className="inline-flex items-center gap-1"><User className="h-4 w-4" /> {proposta.autor}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> Criada em {formatData(proposta.criadaEm)}</span>
            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> Prazo: {formatData(proposta.prazoVotacao)}</span>
            {proposta.encerradaEm && (
              <span className="inline-flex items-center gap-1"><CheckCircle className="h-4 w-4" /> Encerrada em {formatData(proposta.encerradaEm)}</span>
            )}
          </div>
        </div>

        {/* Rejeição pelo síndico (SÍN-005) — motivo, responsável e data da decisão. */}
        {proposta.status === 'rejeitada' && proposta.motivoRejeicao && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              <h2 className="font-medium">Proposta rejeitada</h2>
            </div>
            <p className="whitespace-pre-wrap text-sm text-red-800">{proposta.motivoRejeicao}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-red-200 pt-3 text-xs text-red-700">
              {proposta.rejeitadaPor && (
                <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> Responsável: {proposta.rejeitadaPor}</span>
              )}
              {proposta.rejeitadaEm && (
                <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> {formatData(proposta.rejeitadaEm)}</span>
              )}
            </div>
          </div>
        )}

        {/* Apuracao */}
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-wave-800">Resultado da votacao</h2>
            <span className="text-sm text-wave-500">{ap.total} votos</span>
          </div>
          <div className="mb-3 flex h-4 w-full overflow-hidden rounded-full bg-wave-100">
            <div className="h-full bg-brand-teal" style={{ width: `${pctBar(ap.aprovo)}%` }} />
            <div className="h-full bg-red-500" style={{ width: `${pctBar(ap.reprovo)}%` }} />
            <div className="h-full bg-slate-400" style={{ width: `${pctBar(ap.abstencao)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Tally icon={<CheckCircle className="h-4 w-4 text-brand-teal" />} label="Aprovo" n={ap.aprovo} pct={ap.percentAprovacao} />
            <Tally icon={<XCircle className="h-4 w-4 text-red-600" />} label="Reprovo" n={ap.reprovo} pct={ap.percentReprovacao} />
            <Tally icon={<MinusCircle className="h-4 w-4 text-slate-500" />} label="Abstencao" n={ap.abstencao} pct={ap.percentAbstencao} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-wave-100 pt-4 text-sm">
            <span className="text-wave-500">
              Periodo de votacao: {formatData(proposta.criadaEm)} ate {formatData(proposta.prazoVotacao)}
            </span>
            <span className="font-medium text-wave-800">Resultado final: {resultadoFinal}</span>
          </div>
        </div>

        {/* Historico das etapas percorridas */}
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-6 shadow-lg backdrop-blur-sm">
          <h2 className="mb-4 text-wave-800">Historico das etapas</h2>
          <ol className="space-y-3">
            {etapas.map((e, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                    e.done ? 'bg-brand-teal/15 text-brand-teal' : 'bg-wave-100 text-wave-400'
                  }`}
                >
                  {e.done ? '✓' : i + 1}
                </span>
                <div>
                  <p className={e.done ? 'text-wave-800' : 'text-wave-400'}>{e.label}</p>
                  {e.data && <p className="text-xs text-wave-500">{formatData(e.data)}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Tally({ icon, label, n, pct }: { icon: React.ReactNode; label: string; n: number; pct: number }) {
  return (
    <div className="rounded-xl bg-wave-50 p-3">
      <div className="mb-1 flex items-center justify-center gap-1 text-sm text-wave-600">{icon} {label}</div>
      <p className="text-xl text-wave-800">{n}</p>
      <p className="text-xs text-wave-500">{pct}%</p>
    </div>
  );
}
