'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/RegistrarPagamentoModal.tsx
//
// Registro de pagamento de uma despesa pendente (SÍN-011) — uso de gestor.
// Marca a despesa como paga (data + forma + origem) e, opcionalmente, anexa o
// comprovante (que gera o registro de integridade no servidor).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { X, CircleDollarSign, Paperclip, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import {
  FORMAS_PAGAMENTO,
  FORMA_PAGAMENTO_LABEL,
  ORIGEM_RECURSO_LABEL,
  formatBRL,
  validarPagamento,
  type FormaPagamentoDespesa,
  type OrigemRecurso,
  type Despesa,
} from './despesas';
import { lerComprovante, COMPROVANTE_MAX_BYTES } from './comprovanteFile';
import type { RegistrarPagamentoActionInput, DespesaResult } from '@/app/actions/despesas';

interface RegistrarPagamentoModalProps {
  despesa: Despesa;
  onClose: () => void;
  onConfirm: (id: string, input: RegistrarPagamentoActionInput) => Promise<DespesaResult>;
}

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

const inputCls =
  'w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-400';

export function RegistrarPagamentoModal({ despesa, onClose, onConfirm }: RegistrarPagamentoModalProps) {
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoDespesa>('PIX');
  const [origemRecurso, setOrigemRecurso] = useState<OrigemRecurso>(despesa.origemRecurso);
  const [comprovante, setComprovante] = useState<File | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setComprovante(undefined);
    if (file.size > COMPROVANTE_MAX_BYTES) {
      toast.error('O comprovante excede o limite de 10 MB.');
      e.target.value = '';
      return;
    }
    setComprovante(file);
  }

  async function handleSubmit() {
    const erro = validarPagamento({ dataPagamento });
    if (erro) {
      toast.error(erro);
      return;
    }
    setSubmitting(true);
    try {
      const input: RegistrarPagamentoActionInput = { dataPagamento, formaPagamento, origemRecurso };
      if (comprovante) input.comprovante = await lerComprovante(comprovante);
      const res = await onConfirm(despesa.id, input);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Pagamento registrado!', {
        description: comprovante ? 'Comprovante anexado com registro de integridade.' : undefined,
      });
      onClose();
    } catch {
      toast.error('Não foi possível registrar o pagamento. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-brand-teal to-brand-steel rounded-xl">
              <CircleDollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-blue-900 text-lg">Registrar Pagamento</h2>
              <p className="text-wave-400 text-sm truncate max-w-[16rem]">{despesa.descricao}</p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50" aria-label="Fechar">
            <X className="w-5 h-5 text-blue-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between">
            <span className="text-wave-600 text-sm">Valor</span>
            <span className="text-blue-900 text-lg font-semibold">{formatBRL(despesa.valor)}</span>
          </div>

          <div>
            <label htmlFor="pag-data" className="block text-wave-700 text-sm mb-1.5">Data do pagamento *</label>
            <input id="pag-data" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label htmlFor="pag-forma" className="block text-wave-700 text-sm mb-1.5">Forma de pagamento</label>
            <select id="pag-forma" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamentoDespesa)} className={inputCls}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pag-origem" className="block text-wave-700 text-sm mb-1.5">Origem do recurso</label>
            <select id="pag-origem" value={origemRecurso} onChange={(e) => setOrigemRecurso(e.target.value as OrigemRecurso)} className={inputCls}>
              <option value="SALDO">{ORIGEM_RECURSO_LABEL.SALDO}</option>
              <option value="FUNDO_RESERVA">{ORIGEM_RECURSO_LABEL.FUNDO_RESERVA}</option>
            </select>
          </div>

          <div>
            <label className="block text-wave-700 text-sm mb-1.5">Comprovante de pagamento</label>
            <label className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-dashed border-blue-300 rounded-xl text-blue-700 cursor-pointer hover:bg-blue-100 transition-colors">
              <Paperclip className="w-4 h-4" />
              <span className="text-sm truncate">{comprovante?.name ?? 'Anexar imagem ou PDF (opcional)'}</span>
              <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleFile} />
            </label>
            {comprovante && (
              <p className="text-wave-500 text-xs mt-1.5 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-brand-teal" />
                Registro de integridade gerado ao salvar.
              </p>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-wave-100 flex gap-3">
          <button onClick={onClose} disabled={submitting} className="flex-1 py-3 bg-wave-100 text-wave-700 rounded-xl hover:bg-wave-200 transition-all disabled:opacity-50">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-teal to-brand-steel text-white hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {comprovante ? 'Salvando e ancorando…' : 'Salvando…'}
              </>
            ) : (
              <>
                <CircleDollarSign className="w-4 h-4" />
                Confirmar Pagamento
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
