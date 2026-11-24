'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, MinusCircle, User, Clock, Gavel, Eye, Ban } from 'lucide-react';

import {
  type Proposta,
  type VoteChoice,
  apurar,
  diasRestantes,
  formatData,
  isEmVotacao,
  isVotacaoExpirada,
  CATEGORIA_LABEL,
} from './governanceCore';
import { validarMotivoRejeicao, MOTIVO_MAX } from './rejeicao';
import { StatusBadge } from './StatusBadge';

interface ProposalCardProps {
  proposta: Proposta;
  /** Id do usuario atual (para voto unico). */
  userId: string;
  /** Sindico/Admin: pode encerrar a votacao manualmente. */
  canManage: boolean;
  onVotar: (id: string, escolha: VoteChoice) => void;
  onEncerrar: (id: string) => void;
  /** SÍN-005: rejeita a proposta com justificativa obrigatória. Retorna se deu certo. */
  onRejeitar?: (id: string, motivo: string) => Promise<boolean> | void;
  onVerDetalhes?: (id: string) => void;
}

export function ProposalCard({
  proposta,
  userId,
  canManage,
  onVotar,
  onEncerrar,
  onRejeitar,
  onVerDetalhes,
}: ProposalCardProps) {
  const [rejeitando, setRejeitando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // A rejeição pelo síndico só faz sentido enquanto a proposta não estiver
  // rejeitada; o registro é preservado no histórico após a decisão (SÍN-005).
  const podeRejeitar = Boolean(canManage && onRejeitar) && proposta.status !== 'rejeitada';

  const cancelarRejeicao = () => {
    setRejeitando(false);
    setMotivo('');
    setErroMotivo(null);
  };

  const submitRejeicao = async () => {
    const v = validarMotivoRejeicao(motivo);
    if (!v.ok) {
      setErroMotivo(v.erro);
      return;
    }
    setErroMotivo(null);
    setEnviando(true);
    try {
      const ok = await onRejeitar?.(proposta.id, v.motivo);
      // onRejeitar retorna false quando o servidor recusa — mantém o form aberto.
      if (ok !== false) cancelarRejeicao();
    } finally {
      setEnviando(false);
    }
  };

  const ap = apurar(proposta);
  const aberta = isEmVotacao(proposta) && !isVotacaoExpirada(proposta);
  const meuVoto = proposta.votos[userId];
  const dias = diasRestantes(proposta);

  const pctBar = (n: number) => (ap.total > 0 ? (n / ap.total) * 100 : 0);

  return (
    <article className="rounded-2xl border border-wave-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition-all hover:shadow-md sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={proposta.status} />
        <span className="rounded-full bg-wave-50 px-3 py-1 text-xs text-wave-600">
          {CATEGORIA_LABEL[proposta.categoria]}
        </span>
        {aberta && (
          <span className="inline-flex items-center gap-1 text-xs text-wave-500">
            <Clock className="h-3.5 w-3.5" />
            {dias} {dias === 1 ? 'dia restante' : 'dias restantes'}
          </span>
        )}
      </div>

      <h3 className="mb-1 text-lg text-wave-800">{proposta.titulo}</h3>
      <p className="mb-3 text-sm text-wave-600">{proposta.descricao}</p>
      <p className="mb-4 flex items-center gap-1 text-xs text-wave-500">
        <User className="h-3.5 w-3.5" />
        {proposta.autor} • {formatData(proposta.criadaEm)}
      </p>

      {/* Apuracao */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-wave-600">Aprovacao</span>
          <span className="font-medium text-wave-800">{ap.percentAprovacao}%</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-wave-100">
          <div className="h-full bg-brand-teal" style={{ width: `${pctBar(ap.aprovo)}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${pctBar(ap.reprovo)}%` }} />
          <div className="h-full bg-slate-400" style={{ width: `${pctBar(ap.abstencao)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-brand-teal">✓ {ap.aprovo} aprovam</span>
          <span className="text-red-600">✗ {ap.reprovo} reprovam</span>
          <span className="text-slate-500">• {ap.abstencao} abstencoes</span>
          <span className="text-wave-500">{ap.total} votos no total</span>
        </div>
      </div>

      {/* Votacao (morador, uma vez) */}
      {aberta && userId && !meuVoto && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            onClick={() => onVotar(proposta.id, 'aprovo')}
            className="flex items-center justify-center gap-2 rounded-xl bg-brand-teal py-2.5 text-sm text-white transition-colors hover:opacity-90"
          >
            <CheckCircle className="h-4 w-4" /> Aprovo
          </button>
          <button
            onClick={() => onVotar(proposta.id, 'reprovo')}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-sm text-white transition-colors hover:bg-red-600"
          >
            <XCircle className="h-4 w-4" /> Reprovo
          </button>
          <button
            onClick={() => onVotar(proposta.id, 'abstencao')}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-200"
          >
            <MinusCircle className="h-4 w-4" /> Abstencao
          </button>
        </div>
      )}

      {meuVoto && (
        <div className="rounded-xl bg-wave-50 py-2.5 text-center text-sm text-wave-600">
          Voce votou: <strong>{meuVoto === 'aprovo' ? 'Aprovo' : meuVoto === 'reprovo' ? 'Reprovo' : 'Abstencao'}</strong>
          {' '}(seu voto nao pode ser alterado).
        </div>
      )}

      {/* Acoes */}
      {(onVerDetalhes || (aberta && canManage) || podeRejeitar) && (
        <div className="mt-4 border-t border-wave-100 pt-4">
          {rejeitando ? (
            <div className="flex flex-col gap-3">
              <div>
                <label htmlFor={`motivo-${proposta.id}`} className="mb-1.5 block text-sm font-medium text-wave-700">
                  Motivo da rejeição <span className="text-red-600">*</span>
                </label>
                <textarea
                  id={`motivo-${proposta.id}`}
                  value={motivo}
                  onChange={(e) => {
                    setMotivo(e.target.value);
                    if (erroMotivo) setErroMotivo(null);
                  }}
                  maxLength={MOTIVO_MAX}
                  rows={3}
                  autoFocus
                  placeholder="Ex.: proposta fora do escopo do orçamento aprovado para este ano."
                  aria-invalid={Boolean(erroMotivo)}
                  aria-describedby={erroMotivo ? `motivo-erro-${proposta.id}` : undefined}
                  className={`w-full resize-none rounded-xl border bg-white px-3 py-2 text-sm text-wave-800 placeholder-wave-400 transition-all focus:outline-none focus:ring-2 ${
                    erroMotivo
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-wave-200 focus:border-brand-teal focus:ring-brand-teal/30'
                  }`}
                />
                <div className="mt-1 flex items-center justify-between">
                  {erroMotivo ? (
                    <span id={`motivo-erro-${proposta.id}`} className="text-xs text-red-600">{erroMotivo}</span>
                  ) : (
                    <span className="text-xs text-wave-400">A justificativa fica registrada no histórico da proposta.</span>
                  )}
                  <span className="text-xs text-wave-400">{motivo.length}/{MOTIVO_MAX}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  onClick={cancelarRejeicao}
                  disabled={enviando}
                  className="rounded-lg bg-wave-100 px-4 py-2 text-sm text-wave-600 transition-colors hover:bg-wave-200 disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  onClick={submitRejeicao}
                  disabled={enviando}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  <Ban className="h-4 w-4" /> {enviando ? 'Rejeitando...' : 'Confirmar rejeição'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {onVerDetalhes && (
                <button
                  onClick={() => onVerDetalhes(proposta.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-wave-50 px-4 py-2 text-sm text-wave-600 transition-colors hover:bg-wave-100"
                >
                  <Eye className="h-4 w-4" /> Ver detalhes
                </button>
              )}
              {aberta && canManage && (
                <button
                  onClick={() => onEncerrar(proposta.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm text-white transition-colors hover:bg-slate-800"
                >
                  <Gavel className="h-4 w-4" /> Encerrar agora
                </button>
              )}
              {podeRejeitar && (
                <button
                  onClick={() => setRejeitando(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <Ban className="h-4 w-4" /> Rejeitar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
