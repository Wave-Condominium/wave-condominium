'use client';

import { useState } from 'react';
import { X, HandCoins } from 'lucide-react';

import type { BoletoFull } from './boletoTypes';
import { formatCurrency, formatCompetencia } from './boletoFormat';
import { validarAcordo, PARCELAS_MIN, PARCELAS_MAX, OBS_MAX } from './acordoParcelamento';

interface RegistrarAcordoModalProps {
  boleto: BoletoFull;
  /** Persiste o acordo. Retorna true em caso de sucesso (fecha o modal). */
  onSubmit: (input: { parcelas: number; primeiraParcela: string; observacao: string }) => Promise<boolean>;
  onClose: () => void;
}

/** SÍN-009: registro de acordo de parcelamento de um boleto (ação de cobrança do gestor). */
export function RegistrarAcordoModal({ boleto, onSubmit, onClose }: RegistrarAcordoModalProps) {
  const [parcelas, setParcelas] = useState(2);
  const [primeiraParcela, setPrimeiraParcela] = useState('');
  const [observacao, setObservacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const parcelaAprox = parcelas > 0 ? boleto.amount / parcelas : 0;

  const submit = async () => {
    const v = validarAcordo({ parcelas, primeiraParcela, observacao });
    if (!v.ok) {
      setErro(v.erro);
      return;
    }
    setErro(null);
    setEnviando(true);
    try {
      const ok = await onSubmit(v.acordo);
      if (ok) onClose();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-wave-800/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-wave-100 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-teal/15 p-2">
              <HandCoins className="h-5 w-5 text-brand-teal" />
            </div>
            <h2 className="text-lg text-wave-800">Registrar acordo de parcelamento</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-wave-500 transition-colors hover:bg-wave-50" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 rounded-xl bg-wave-50 p-3 text-sm text-wave-600">
          <p><strong className="text-wave-800">{boleto.description}</strong> — Unidade {boleto.unitNumber}</p>
          <p>Competência {formatCompetencia(boleto.referenceMonth)} • Valor {formatCurrency(boleto.amount)}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="acordo-parcelas" className="mb-1.5 block text-sm font-medium text-wave-700">
              Número de parcelas <span className="text-red-600">*</span>
            </label>
            <select
              id="acordo-parcelas"
              value={parcelas}
              onChange={(e) => { setParcelas(Number(e.target.value)); if (erro) setErro(null); }}
              className="w-full rounded-xl border border-wave-200 bg-white px-3 py-2.5 text-sm text-wave-800 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            >
              {Array.from({ length: PARCELAS_MAX - PARCELAS_MIN + 1 }, (_, i) => PARCELAS_MIN + i).map((n) => (
                <option key={n} value={n}>{n}x de aprox. {formatCurrency(boleto.amount / n)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="acordo-data" className="mb-1.5 block text-sm font-medium text-wave-700">
              Vencimento da 1ª parcela <span className="text-red-600">*</span>
            </label>
            <input
              id="acordo-data"
              type="date"
              value={primeiraParcela}
              onChange={(e) => { setPrimeiraParcela(e.target.value); if (erro) setErro(null); }}
              className="w-full rounded-xl border border-wave-200 bg-white px-3 py-2.5 text-sm text-wave-800 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
          </div>

          <div>
            <label htmlFor="acordo-obs" className="mb-1.5 block text-sm font-medium text-wave-700">
              Observação <span className="text-wave-400">(opcional)</span>
            </label>
            <textarea
              id="acordo-obs"
              value={observacao}
              onChange={(e) => { setObservacao(e.target.value); if (erro) setErro(null); }}
              maxLength={OBS_MAX}
              rows={3}
              placeholder="Ex.: acordo combinado com o morador por telefone."
              className="w-full resize-none rounded-xl border border-wave-200 bg-white px-3 py-2 text-sm text-wave-800 placeholder-wave-400 focus:border-brand-teal focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            />
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-wave-400">Aprox. {formatCurrency(parcelaAprox)} por parcela.</span>
              <span className="text-xs text-wave-400">{observacao.length}/{OBS_MAX}</span>
            </div>
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={enviando}
            className="rounded-lg bg-wave-100 px-4 py-2.5 text-sm text-wave-600 transition-colors hover:bg-wave-200 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={enviando}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-teal px-4 py-2.5 text-sm text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            <HandCoins className="h-4 w-4" /> {enviando ? 'Registrando...' : 'Registrar acordo'}
          </button>
        </div>
      </div>
    </div>
  );
}
