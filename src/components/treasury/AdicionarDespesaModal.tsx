'use client';

// ---------------------------------------------------------------------------
// src/components/treasury/AdicionarDespesaModal.tsx
//
// Cadastro de despesa (SÍN-011) — uso EXCLUSIVO de gestor (Síndico/
// Administradora/Admin). O botão que abre este modal só é renderizado para
// gestor, e a autorização é revalidada no servidor.
//
// Campos: categoria (14), descrição, fornecedor/beneficiário, valor, data de
// vencimento; opcionalmente "já paga" (data de pagamento + forma), origem do
// recurso e comprovante. Ao anexar comprovante, o servidor gera o registro de
// integridade (SHA-256 + âncora Stellar).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import { X, Receipt, Paperclip, Info, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import {
  CATEGORIAS_DESPESA,
  CATEGORIA_DESPESA_LABEL,
  FORMAS_PAGAMENTO,
  FORMA_PAGAMENTO_LABEL,
  ORIGEM_RECURSO_LABEL,
  validarNovaDespesa,
  type CategoriaDespesa,
  type FormaPagamentoDespesa,
  type OrigemRecurso,
  type NovaDespesaInput,
} from './despesas';
import { lerComprovante, COMPROVANTE_MAX_BYTES } from './comprovanteFile';
import type { CriarDespesaInput, DespesaResult } from '@/app/actions/despesas';

interface AdicionarDespesaModalProps {
  onClose: () => void;
  onCreate: (input: CriarDespesaInput) => Promise<DespesaResult>;
}

function hojeISO(): string {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
}

const inputCls =
  'w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400';

export function AdicionarDespesaModal({ onClose, onCreate }: AdicionarDespesaModalProps) {
  const [categoria, setCategoria] = useState<CategoriaDespesa>('MANUTENCAO_PREDIAL');
  const [descricao, setDescricao] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [valor, setValor] = useState('');
  const [dataVencimento, setDataVencimento] = useState(hojeISO());
  const [jaPaga, setJaPaga] = useState(false);
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoDespesa>('PIX');
  const [origemRecurso, setOrigemRecurso] = useState<OrigemRecurso>('SALDO');
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
    const input: NovaDespesaInput = {
      categoria,
      descricao,
      fornecedor: fornecedor.trim() || undefined,
      valor: Number(valor.replace(',', '.')),
      dataVencimento,
      dataPagamento: jaPaga ? dataPagamento : undefined,
      formaPagamento: jaPaga ? formaPagamento : undefined,
      origemRecurso,
    };

    const erro = validarNovaDespesa(input);
    if (erro) {
      toast.error(erro);
      return;
    }

    setSubmitting(true);
    try {
      const payload: CriarDespesaInput = { ...input };
      if (comprovante) {
        payload.comprovante = await lerComprovante(comprovante);
      }
      const res = await onCreate(payload);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success('Despesa registrada!', {
        description: comprovante
          ? 'Comprovante anexado e registro de integridade gerado.'
          : 'Ela já aparece na gestão de despesas.',
      });
      onClose();
    } catch {
      toast.error('Não foi possível registrar a despesa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
              <Receipt className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-blue-900 text-xl">Adicionar Despesa</h2>
              <p className="text-wave-400 text-sm">Registro financeiro do condomínio</p>
            </div>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-2 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50" aria-label="Fechar">
            <X className="w-5 h-5 text-blue-600" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Categoria */}
          <div>
            <label htmlFor="desp-categoria" className="block text-wave-700 text-sm mb-1.5">Categoria *</label>
            <select
              id="desp-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as CategoriaDespesa)}
              className={inputCls}
            >
              {CATEGORIAS_DESPESA.map((c) => (
                <option key={c} value={c}>{CATEGORIA_DESPESA_LABEL[c]}</option>
              ))}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor="desp-descricao" className="block text-wave-700 text-sm mb-1.5">Descrição *</label>
            <input
              id="desp-descricao"
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Reparo da bomba d'água"
              className={inputCls}
            />
          </div>

          {/* Fornecedor / beneficiário */}
          <div>
            <label htmlFor="desp-fornecedor" className="block text-wave-700 text-sm mb-1.5">Fornecedor ou beneficiário</label>
            <input
              id="desp-fornecedor"
              type="text"
              value={fornecedor}
              onChange={(e) => setFornecedor(e.target.value)}
              placeholder="Ex: Elevadores Atlas Ltda."
              className={inputCls}
            />
          </div>

          {/* Valor + Vencimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="desp-valor" className="block text-wave-700 text-sm mb-1.5">Valor (R$) *</label>
              <input
                id="desp-valor"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="desp-vencimento" className="block text-wave-700 text-sm mb-1.5">Data de vencimento *</label>
              <input
                id="desp-vencimento"
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Já paga? */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={jaPaga}
              onChange={(e) => setJaPaga(e.target.checked)}
              className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-400"
            />
            <span className="text-wave-700 text-sm">Esta despesa já foi paga</span>
          </label>

          {jaPaga && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="desp-pagamento" className="block text-wave-700 text-sm mb-1.5">Data do pagamento *</label>
                <input
                  id="desp-pagamento"
                  type="date"
                  value={dataPagamento}
                  onChange={(e) => setDataPagamento(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="desp-forma" className="block text-wave-700 text-sm mb-1.5">Forma de pagamento</label>
                <select
                  id="desp-forma"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as FormaPagamentoDespesa)}
                  className={inputCls}
                >
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>{FORMA_PAGAMENTO_LABEL[f]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Origem do recurso */}
          <div>
            <label htmlFor="desp-origem" className="block text-wave-700 text-sm mb-1.5">Origem do recurso *</label>
            <select
              id="desp-origem"
              value={origemRecurso}
              onChange={(e) => setOrigemRecurso(e.target.value as OrigemRecurso)}
              className={inputCls}
            >
              <option value="SALDO">{ORIGEM_RECURSO_LABEL.SALDO}</option>
              <option value="FUNDO_RESERVA">{ORIGEM_RECURSO_LABEL.FUNDO_RESERVA}</option>
            </select>
            <p className="text-wave-400 text-xs mt-1.5">
              Padrão: saldo disponível. Use o Fundo de Reserva apenas em despesas extraordinárias
              ou autorizadas pela governança.
            </p>
          </div>

          {/* Comprovante */}
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
                Ao salvar, geramos um registro de integridade (hash ancorado na Stellar).
              </p>
            )}
          </div>

          {/* Nota da regra financeira */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-blue-700 text-xs">
              A despesa é registrada com a origem informada. O desconto automático no saldo ou no
              Fundo de Reserva será aplicado quando a regra financeira for definida (MOR-054).
            </p>
          </div>
        </div>

        {/* Ações */}
        <div className="p-5 border-t border-wave-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-3 bg-wave-100 text-wave-700 rounded-xl hover:bg-wave-200 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand-deep to-brand-steel text-white hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {comprovante ? 'Registrando e ancorando…' : 'Registrando…'}
              </>
            ) : (
              <>
                <Receipt className="w-4 h-4" />
                Registrar Despesa
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
