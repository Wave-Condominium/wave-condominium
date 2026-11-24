'use client';

// ---------------------------------------------------------------------------
// src/components/meetings/ParticipantesModal.tsx
//
// Registro de participantes confirmados de uma reunião (MOR-032) — visão do
// Síndico/Administradora. Lista quem confirmou presença (nome, unidade, data).
// Somente leitura; o render é guardado por RBAC no componente pai.
// ---------------------------------------------------------------------------

import { X, Users, Home, Clock } from 'lucide-react';

import type { ConfirmacaoPresenca } from './presencaConfirmacoes';

interface ParticipantesModalProps {
  titulo: string;
  confirmacoes: ConfirmacaoPresenca[];
  onClose: () => void;
}

function formatDataHoraBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ParticipantesModal({ titulo, confirmacoes, onClose }: ParticipantesModalProps) {
  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-blue-900 text-xl truncate">Participantes confirmados</h2>
              <p className="text-wave-400 text-sm truncate">{titulo}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" aria-label="Fechar">
            <X className="w-5 h-5 text-blue-600" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-wave-500 text-sm mb-3">
            {confirmacoes.length} {confirmacoes.length === 1 ? 'morador confirmou' : 'moradores confirmaram'} presença.
          </p>

          {confirmacoes.length === 0 ? (
            <p className="py-8 text-center text-sm text-wave-400">
              Nenhuma confirmação registrada até o momento.
            </p>
          ) : (
            <ul className="divide-y divide-wave-50">
              {confirmacoes.map((c, i) => (
                <li key={`${c.unidade || c.nome}-${i}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-wave-800 text-sm truncate">{c.nome}</p>
                    <p className="text-wave-500 text-xs flex items-center gap-1">
                      <Home className="w-3 h-3" aria-hidden="true" />
                      {c.unidade ? `Unidade ${c.unidade}` : 'Sem unidade'}
                    </p>
                  </div>
                  <span className="text-wave-400 text-xs flex items-center gap-1 shrink-0">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    {formatDataHoraBR(c.confirmadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
