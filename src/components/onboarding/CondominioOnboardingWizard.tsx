'use client';

// ---------------------------------------------------------------------------
// src/components/onboarding/CondominioOnboardingWizard.tsx  —  SÍN-030
//
// Wizard de onboarding do condomínio: dados do condomínio + endereço → dados
// bancários → responsável + consentimento → revisão → criação. Após criar, mostra
// o acompanhamento do vínculo com o PSP (subconta + KYC), até o condomínio ficar
// APTO a operar financeiramente. Só gestão chega aqui (rota protegida + backend).
// ---------------------------------------------------------------------------

import { useState } from 'react';
import {
  Building2, MapPin, Landmark, UserCheck, CheckCircle, ArrowRight, ArrowLeft,
  Loader2, ShieldCheck, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

import { formatCNPJ, formatCEP } from '@/lib/validators';
import { useBlockchainAutoRegistry } from '@/hooks/useBlockchainAutoRegistry';
import {
  validarNovoCondominio,
  PSP_STATUS_LABEL,
  PSP_STATUS_COR,
  RELACAO_RESPONSAVEL_LABEL,
  aptoParaFinanceiro,
  type NovoCondominioInput,
  type PspStatus,
  type TipoContaBancaria,
  type RelacaoResponsavel,
} from '@/components/onboarding/condominioOnboarding';
import {
  criarCondominioAction,
  avancarOnboardingPspAction,
} from '@/app/actions/onboarding';

interface Props {
  /** Chamado quando o onboarding conclui (condomínio APTO). */
  onConcluido?: (condominiumId: string) => void;
}

type Estado =
  | { fase: 'form' }
  | { fase: 'psp'; condominiumId: string; pspStatus: PspStatus };

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const vazio: NovoCondominioInput = {
  nome: '', cnpj: '',
  endereco: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' },
  banco: { banco: '', agencia: '', conta: '', tipoConta: 'CORRENTE', pixChave: '' },
  responsavel: { nome: '', email: '', telefone: '', relacao: 'SINDICO' },
  consentimentoRepresentacao: false,
};

const inputCls =
  'w-full min-h-[48px] px-4 py-3 bg-white border border-wave-200 rounded-xl text-wave-800 focus:outline-none focus:ring-2 focus:ring-wave-300';
const labelCls = 'block text-sm font-medium text-wave-700 mb-1.5';

export function CondominioOnboardingWizard({ onConcluido }: Props) {
  const { registerOnboardingStep } = useBlockchainAutoRegistry();
  const [estado, setEstado] = useState<Estado>({ fase: 'form' });
  const [step, setStep] = useState(1);
  const [data, setData] = useState<NovoCondominioInput>(vazio);
  const [enviando, setEnviando] = useState(false);
  const totalSteps = 4;

  const setEndereco = (patch: Partial<NovoCondominioInput['endereco']>) =>
    setData((d) => ({ ...d, endereco: { ...d.endereco, ...patch } }));
  const setBanco = (patch: Partial<NovoCondominioInput['banco']>) =>
    setData((d) => ({ ...d, banco: { ...d.banco, ...patch } }));
  const setResp = (patch: Partial<NovoCondominioInput['responsavel']>) =>
    setData((d) => ({ ...d, responsavel: { ...d.responsavel, ...patch } }));

  async function criar() {
    const erro = validarNovoCondominio(data);
    if (erro) { toast.error(erro); return; }
    setEnviando(true);
    const res = await criarCondominioAction(data);
    setEnviando(false);
    if (!res.ok) { toast.error(res.error); return; }

    void registerOnboardingStep({
      etapa: 'Cadastro + início da subconta no PSP',
      condominioNome: data.nome,
      cnpj: formatCNPJ(data.cnpj),
      responsavel: data.responsavel.nome,
      statusPsp: PSP_STATUS_LABEL[res.pspStatus],
    });
    toast.success('Condomínio cadastrado! Subconta no PSP iniciada.');
    setEstado({ fase: 'psp', condominiumId: res.condominiumId, pspStatus: res.pspStatus });
  }

  async function avancarPsp() {
    if (estado.fase !== 'psp') return;
    setEnviando(true);
    const res = await avancarOnboardingPspAction(estado.condominiumId);
    setEnviando(false);
    if (!res.ok) { toast.error(res.error); return; }

    void registerOnboardingStep({
      etapa: 'Progressão do KYC no PSP',
      condominioNome: data.nome || 'Condomínio',
      cnpj: formatCNPJ(data.cnpj),
      responsavel: data.responsavel.nome || '—',
      statusPsp: PSP_STATUS_LABEL[res.pspStatus],
    });
    setEstado({ ...estado, pspStatus: res.pspStatus });
    if (res.apto) {
      toast.success('Condomínio apto a operar financeiramente!');
      onConcluido?.(estado.condominiumId);
    }
  }

  // --- Acompanhamento do PSP (pós-cadastro) ----------------------------------
  if (estado.fase === 'psp') {
    const apto = aptoParaFinanceiro(estado.pspStatus);
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-wave-100 shadow-lg p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-3 rounded-xl ${apto ? 'bg-emerald-100' : 'bg-wave-100'}`}>
              {apto ? <ShieldCheck className="w-6 h-6 text-emerald-600" /> : <Clock className="w-6 h-6 text-wave-500" />}
            </div>
            <div>
              <h2 className="text-wave-800 text-xl">Vínculo com o PSP</h2>
              <p className="text-wave-500 text-sm">Criação da subconta e verificação (KYC)</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-wave-50 border border-wave-100 px-4 py-3 mb-4">
            <span className="text-wave-600 text-sm">Status atual</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${PSP_STATUS_COR[estado.pspStatus]}`}>
              {PSP_STATUS_LABEL[estado.pspStatus]}
            </span>
          </div>

          {apto ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm">
              Subconta ativa e KYC concluído. O condomínio está <strong>apto a operações
              financeiras</strong> (boletos, receitas e despesas).
            </div>
          ) : (
            <>
              <p className="text-wave-600 text-sm mb-4">
                O condomínio <strong>ainda não está apto</strong> a operações financeiras. Conclua as
                etapas obrigatórias do PSP. <span className="text-wave-400">(Ambiente simulado — o botão
                abaixo representa o avanço do KYC, que na produção vem do provedor.)</span>
              </p>
              <button
                onClick={avancarPsp}
                disabled={enviando}
                className="w-full min-h-[48px] py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                Avançar etapa do PSP
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // --- Formulário (wizard) ---------------------------------------------------
  const stepMeta = [
    { icon: Building2, titulo: 'Condomínio e endereço' },
    { icon: Landmark, titulo: 'Dados bancários' },
    { icon: UserCheck, titulo: 'Responsável e consentimento' },
    { icon: CheckCircle, titulo: 'Revisão' },
  ];

  function proximo() {
    // Validação leve por etapa (a validação completa roda no submit e no servidor).
    if (step === 1 && (!data.nome.trim() || !data.cnpj.trim() || !data.endereco.cep || !data.endereco.logradouro.trim() || !data.endereco.numero.trim() || !data.endereco.bairro.trim() || !data.endereco.cidade.trim() || !data.endereco.uf)) {
      toast.error('Preencha os dados do condomínio e o endereço.'); return;
    }
    if (step === 2 && (!data.banco.banco.trim() || !data.banco.agencia.trim() || !data.banco.conta.trim())) {
      toast.error('Preencha os dados bancários.'); return;
    }
    if (step === 3 && (!data.responsavel.nome.trim() || !data.responsavel.email.trim() || !data.responsavel.telefone.trim() || !data.consentimentoRepresentacao)) {
      toast.error('Preencha o responsável e confirme o consentimento.'); return;
    }
    setStep((s) => Math.min(totalSteps, s + 1));
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Passos */}
      <div className="flex items-center justify-between mb-6">
        {stepMeta.map((m, i) => {
          const n = i + 1;
          const ativo = n === step;
          const feito = n < step;
          const Icon = m.icon;
          return (
            <div key={n} className="flex items-center flex-1 last:flex-none">
              <div className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${feito ? 'bg-brand-teal text-white' : ativo ? 'bg-brand-deep text-white' : 'bg-wave-100 text-wave-400'}`}>
                {feito ? <CheckCircle className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
              </div>
              {n < totalSteps && <div className={`h-1 flex-1 mx-2 rounded ${feito ? 'bg-brand-teal' : 'bg-wave-100'}`} />}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-wave-100 shadow-lg p-6 sm:p-8">
        <h2 className="text-wave-800 text-xl mb-6">{stepMeta[step - 1].titulo}</h2>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Razão social / nome do condomínio</label>
              <input className={inputCls} value={data.nome} onChange={(e) => setData((d) => ({ ...d, nome: e.target.value }))} placeholder="Ex.: Condomínio Residencial Aurora" />
            </div>
            <div>
              <label className={labelCls}>CNPJ</label>
              <input className={inputCls} value={data.cnpj} onChange={(e) => setData((d) => ({ ...d, cnpj: formatCNPJ(e.target.value) }))} placeholder="00.000.000/0000-00" inputMode="numeric" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>CEP</label>
                <input className={inputCls} value={data.endereco.cep} onChange={(e) => setEndereco({ cep: formatCEP(e.target.value) })} placeholder="00000-000" inputMode="numeric" />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Logradouro</label>
                <input className={inputCls} value={data.endereco.logradouro} onChange={(e) => setEndereco({ logradouro: e.target.value })} placeholder="Rua / Avenida" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={labelCls}>Número</label>
                <input className={inputCls} value={data.endereco.numero} onChange={(e) => setEndereco({ numero: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className={labelCls}>Complemento (opcional)</label>
                <input className={inputCls} value={data.endereco.complemento} onChange={(e) => setEndereco({ complemento: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Bairro</label>
                <input className={inputCls} value={data.endereco.bairro} onChange={(e) => setEndereco({ bairro: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Cidade</label>
                <input className={inputCls} value={data.endereco.cidade} onChange={(e) => setEndereco({ cidade: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <select className={inputCls} value={data.endereco.uf} onChange={(e) => setEndereco({ uf: e.target.value })}>
                  <option value="">—</option>
                  {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-wave-500 text-sm">
              <MapPin className="w-4 h-4" /> Conta usada no vínculo com o PSP (subconta do condomínio).
            </div>
            <div>
              <label className={labelCls}>Banco</label>
              <input className={inputCls} value={data.banco.banco} onChange={(e) => setBanco({ banco: e.target.value })} placeholder="Ex.: 001 - Banco do Brasil" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Agência</label>
                <input className={inputCls} value={data.banco.agencia} onChange={(e) => setBanco({ agencia: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Conta</label>
                <input className={inputCls} value={data.banco.conta} onChange={(e) => setBanco({ conta: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Tipo de conta</label>
                <select className={inputCls} value={data.banco.tipoConta} onChange={(e) => setBanco({ tipoConta: e.target.value as TipoContaBancaria })}>
                  <option value="CORRENTE">Corrente</option>
                  <option value="POUPANCA">Poupança</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Chave PIX (opcional)</label>
                <input className={inputCls} value={data.banco.pixChave} onChange={(e) => setBanco({ pixChave: e.target.value })} />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome do responsável</label>
              <input className={inputCls} value={data.responsavel.nome} onChange={(e) => setResp({ nome: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>E-mail</label>
                <input className={inputCls} type="email" value={data.responsavel.email} onChange={(e) => setResp({ email: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Telefone</label>
                <input className={inputCls} value={data.responsavel.telefone} onChange={(e) => setResp({ telefone: e.target.value })} placeholder="(00) 00000-0000" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Relação com o condomínio</label>
              <select className={inputCls} value={data.responsavel.relacao} onChange={(e) => setResp({ relacao: e.target.value as RelacaoResponsavel })}>
                {(Object.keys(RELACAO_RESPONSAVEL_LABEL) as RelacaoResponsavel[]).map((r) => (
                  <option key={r} value={r}>{RELACAO_RESPONSAVEL_LABEL[r]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-3 rounded-xl bg-wave-50 border border-wave-100 p-4 cursor-pointer">
              <input type="checkbox" className="mt-1 w-5 h-5 accent-brand-deep" checked={data.consentimentoRepresentacao} onChange={(e) => setData((d) => ({ ...d, consentimentoRepresentacao: e.target.checked }))} />
              <span className="text-sm text-wave-700">
                Declaro possuir legitimidade para representar/administrar o condomínio e consinto com o
                cadastro e o vínculo com o PSP, nos termos dos <strong>arts. 1.347 a 1.349 do Código Civil</strong>.
              </span>
            </label>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3 text-sm">
            <Linha rotulo="Condomínio" valor={data.nome} />
            <Linha rotulo="CNPJ" valor={formatCNPJ(data.cnpj)} />
            <Linha rotulo="Endereço" valor={`${data.endereco.logradouro}, ${data.endereco.numero} — ${data.endereco.bairro}, ${data.endereco.cidade}/${data.endereco.uf}, ${data.endereco.cep}`} />
            <Linha rotulo="Banco" valor={`${data.banco.banco} · Ag ${data.banco.agencia} · Conta ${data.banco.conta} (${data.banco.tipoConta === 'CORRENTE' ? 'Corrente' : 'Poupança'})`} />
            <Linha rotulo="Responsável" valor={`${data.responsavel.nome} · ${data.responsavel.email} · ${RELACAO_RESPONSAVEL_LABEL[data.responsavel.relacao]}`} />
            <div className="rounded-xl bg-wave-50 border border-wave-100 p-3 text-wave-600">
              Ao concluir, criaremos o condomínio e iniciaremos a <strong>subconta no PSP</strong>. Ele só
              ficará apto a operações financeiras após a conclusão do KYC.
            </div>
          </div>
        )}

        {/* Navegação */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button onClick={() => setStep((s) => s - 1)} disabled={enviando} className="px-5 min-h-[48px] py-3 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all flex items-center gap-2">
              <ArrowLeft className="w-5 h-5" /> Voltar
            </button>
          )}
          {step < totalSteps ? (
            <button onClick={proximo} className="flex-1 min-h-[48px] py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2">
              Continuar <ArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <button onClick={criar} disabled={enviando} className="flex-1 min-h-[48px] py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60">
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
              Cadastrar condomínio
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-3">
      <span className="text-wave-400 sm:w-32 shrink-0">{rotulo}</span>
      <span className="text-wave-800 break-words">{valor || '—'}</span>
    </div>
  );
}
