import { useState } from 'react';
import { Wallet, TrendingUp, TrendingDown, Download, CreditCard, Smartphone, X, AlertCircle, Users, Receipt, FileText, Send } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { useFinancialSummary, PAID_STATUS } from '../../hooks/useFinancialSummary';

import { GenerateBoletoModal } from './GenerateBoletoModal';
import { DespesasSection } from './DespesasSection';
import { HistoricoTransacoes } from './HistoricoTransacoes';
import { AdicionarDespesaModal } from './AdicionarDespesaModal';
import { GestaoDespesas } from './GestaoDespesas';
import { ConciliacaoPanel } from './ConciliacaoPanel';
import { useDespesas } from './useDespesas';
import { isManager, type Role } from '@/lib/rbac';

interface TreasuryProps {
  userProfile?: {
    role: Role;
  };
}

const MONTH_LABELS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatMonthLabel(monthKey: string): string {
  const [, month] = monthKey.split('-');
  const idx = parseInt(month, 10) - 1;
  return MONTH_LABELS_PT[idx] ?? monthKey;
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function Treasury({ userProfile }: TreasuryProps) {
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [showGenerateBoletoModal, setShowGenerateBoletoModal] = useState(false);
  const [showAddDespesa, setShowAddDespesa] = useState(false);
  const [view, setView] = useState<'overview' | 'boletos'>('overview');

  // Extraído para src/hooks/useFinancialSummary.ts — mesmo cálculo que o
  // Dashboard usa, garantindo que os dois lugares nunca divirjam.
  const {
    boletos,
    saldoAtual,
    fundoReserva,
    currentMonthKey,
    boletosDoMes,
    boletosPagosDoMes,
    receitasDoMes,
    percentualAdimplencia,
    percentualInadimplencia,
    boletosVencidos,
    totalInadimplencia,
    unidadesInadimplentes,
    totalUnidadesConhecidas,
    loading,
  } = useFinancialSummary();

  const isManagerRole = isManager(userProfile?.role);

  // Despesas (SÍN-011) — fonte real (backend), compartilhada entre a seção
  // "Despesas" (distribuição), a "Gestão de Despesas" e a série do gráfico de
  // evolução. Estado único aqui garante que tudo reflita o mesmo dado.
  const {
    despesas,
    loading: despesasLoading,
    error: despesasError,
    criar: criarDespesa,
    registrarPagamento: registrarPagamentoDespesa,
  } = useDespesas();

  // Despesas PAGAS somadas por mês do pagamento (YYYY-MM) — alimenta a série
  // "despesas" do gráfico de evolução com valores reais.
  const despesasPagasPorMes = new Map<string, number>();
  for (const d of despesas) {
    if (d.status !== 'PAGO') continue;
    const mesKey = (d.dataPagamento ?? d.dataVencimento).slice(0, 7);
    despesasPagasPorMes.set(mesKey, (despesasPagasPorMes.get(mesKey) ?? 0) + d.valor);
  }

  const metaFundoReserva = 100000; // meta ainda fixa — não há de onde derivar isso dos boletos
  const percentualMeta = metaFundoReserva > 0 ? Math.min(100, Math.round((fundoReserva / metaFundoReserva) * 100)) : 0;

  // Boletos pendentes (e ainda não vencidos) — para o card "Boletos Pendentes"
  const boletosPendentesNaoVencidos = boletos.filter(b => b.status === 'pending' && !boletosVencidos.includes(b));
  const totalPendenteNaoVencido = boletosPendentesNaoVencidos.reduce((sum, b) => sum + b.amount, 0);

  // Boletos pagos no ano corrente — para o card "Boletos Pagos (ano)"
  const anoAtual = String(new Date().getFullYear());
  const boletosPagosNoAno = boletos.filter(b => b.status === PAID_STATUS && b.referenceMonth.startsWith(anoAtual));
  const totalEmitidosNoAno = boletos.filter(b => b.referenceMonth.startsWith(anoAtual)).length;
  const taxaAdimplenciaAno = totalEmitidosNoAno > 0
    ? Math.round((boletosPagosNoAno.length / totalEmitidosNoAno) * 100)
    : 0;

  // Evolução Financeira (últimos 6 meses com dados reais de receita)
  const monthsWithData = Array.from(new Set(boletos.map(b => b.referenceMonth))).sort();
  const last6Months = monthsWithData.slice(-6);
  const balanceData = last6Months.length > 0
    ? last6Months.map(monthKey => {
        const receitas = boletos
          .filter(b => b.referenceMonth === monthKey && b.status === PAID_STATUS)
          .reduce((sum, b) => sum + b.amount, 0);
        return {
          month: formatMonthLabel(monthKey),
          receitas,
          // Despesas reais pagas no mês (SÍN-011).
          despesas: despesasPagasPorMes.get(monthKey) ?? 0,
        };
      })
    : [];

  const handleExport = () => {
    toast.success('Exportação iniciada!', {
      description: 'O relatório será baixado em breve.'
    });
  };

  const handleGenerateBoletos = (data: any) => {
    console.log('Gerando boletos:', data);
    const count = data.units.length;
    toast.success(`${count} boleto${count !== 1 ? 's' : ''} gerado${count !== 1 ? 's' : ''} com sucesso!`, {
      description: `Os moradores receberão notificações por e-mail e SMS.`
    });
    setShowGenerateBoletoModal(false);
  };

  const handleSendBoletoReminder = () => {
    toast.success('Lembretes enviados!', {
      description: `Notificações enviadas para ${unidadesInadimplentes.size} unidade${unidadesInadimplentes.size !== 1 ? 's' : ''} em atraso.`
    });
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen">
        <div className="rounded-2xl border border-wave-100 bg-white/80 p-12 text-center text-wave-500 shadow-lg backdrop-blur-sm">
          Carregando dados financeiros...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">


      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Gestão Financeira</h1>
          <p className="text-wave-500">Transparência total com registros auditáveis</p>
        </div>
        {/* MOR-054: "Ir para Boletos" foi substituído por "Adicionar Despesa",
            disponível apenas para perfis administrativos (Síndico/Administradora).
            O Morador é somente leitura — não vê este botão. */}
        {isManagerRole && (
          <button
            onClick={() => setShowAddDespesa(true)}
            className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center gap-2"
          >
            <Receipt className="w-5 h-5" />
            Adicionar Despesa
          </button>
        )}
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 relative z-10">
        <div className="bg-gradient-to-br from-brand-deep to-brand-steel rounded-2xl p-6 text-white shadow-lg border border-wave-400">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="w-5 h-5 text-wave-100" />
            <p className="text-wave-100 text-sm">Saldo Atual</p>
          </div>
          <p className="text-3xl mb-1">{formatBRL(saldoAtual)}</p>
          <p className="text-wave-100 text-sm">Caixa disponível</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-wave-100 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-wave-500 text-sm">Fundo de Reserva</p>
            <TrendingUp className="w-5 h-5 text-brand-teal" />
          </div>
          <p className="text-wave-800 text-2xl mb-1">{formatBRL(fundoReserva)}</p>
          <div className="w-full bg-wave-100 rounded-full h-2 mt-3">
            <div className="bg-gradient-to-r from-brand-teal to-brand-steel h-2 rounded-full" style={{ width: `${percentualMeta}%` }} />
          </div>
          <p className="text-brand-teal text-sm mt-2">{percentualMeta}% da meta ({formatBRL(metaFundoReserva)})</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-wave-100 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-wave-500 text-sm">Receitas ({formatMonthLabel(currentMonthKey)})</p>
            <TrendingUp className="w-5 h-5 text-brand-teal" />
          </div>
          <p className="text-wave-800 text-2xl mb-1">{formatBRL(receitasDoMes)}</p>
          <p className="text-wave-500 text-sm">
            {percentualAdimplencia}% arrecadado ({boletosPagosDoMes.length}/{boletosDoMes.length || totalUnidadesConhecidas} unidades)
          </p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-wave-100 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="text-wave-500 text-sm">Inadimplência</p>
            <AlertCircle className="w-5 h-5 text-orange-500" />
          </div>
          <p className="text-orange-600 text-2xl mb-1">{formatBRL(totalInadimplencia)}</p>
          <p className="text-wave-500 text-sm">
            {percentualInadimplencia}% · {unidadesInadimplentes.size} unidade{unidadesInadimplentes.size !== 1 ? 's' : ''} em atraso
          </p>
        </div>
      </div>

      {/* Despesas — abaixo das Receitas: distribuição por categoria das despesas
          pagas. Somente leitura para o Morador. */}
      <DespesasSection despesas={despesas} periodoLabel={formatMonthLabel(currentMonthKey)} />

      {/* Gestão de Despesas (SÍN-011) — registrar/acompanhar/consultar: só gestor. */}
      {isManagerRole && (
        <GestaoDespesas
          despesas={despesas}
          loading={despesasLoading}
          error={despesasError}
          onNovaDespesa={() => setShowAddDespesa(true)}
          onRegistrarPagamento={registrarPagamentoDespesa}
        />
      )}

      {/* Admin: Gestão de Boletos */}
      {isManagerRole && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg mb-8 relative z-10">
          <div className="p-6 border-b border-wave-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
                  <Receipt className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-wave-800 text-lg">Gestão de Boletos</h3>
                  <p className="text-wave-500 text-sm">Emita e gerencie boletos de condomínio</p>
                </div>
              </div>
              <button
                onClick={() => setShowGenerateBoletoModal(true)}
                className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center gap-2"
              >
                <Receipt className="w-5 h-5" />
                Gerar Boletos
              </button>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Resumo de Boletos */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border border-orange-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-orange-200 rounded-lg">
                    <FileText className="w-5 h-5 text-orange-700" />
                  </div>
                  <span className="text-2xl text-orange-900">{boletosPendentesNaoVencidos.length}</span>
                </div>
                <h4 className="text-orange-900">Boletos Pendentes</h4>
                <p className="text-orange-700 text-sm">{formatBRL(totalPendenteNaoVencido)} a receber</p>
              </div>

              <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-red-200 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-700" />
                  </div>
                  <span className="text-2xl text-red-900">{boletosVencidos.length}</span>
                </div>
                <h4 className="text-red-900">Boletos Vencidos</h4>
                <p className="text-red-700 text-sm">{formatBRL(totalInadimplencia)} em atraso</p>
              </div>

              <div className="bg-gradient-to-br from-brand-teal/10 to-brand-teal/15 rounded-xl p-4 border border-brand-teal/30">
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 bg-brand-teal/20 rounded-lg">
                    <Receipt className="w-5 h-5 text-brand-teal" />
                  </div>
                  <span className="text-2xl text-brand-navy">{boletosPagosNoAno.length}</span>
                </div>
                <h4 className="text-brand-navy">Boletos Pagos ({anoAtual})</h4>
                <p className="text-brand-teal text-sm">Taxa de adimplência: {taxaAdimplenciaAno}%</p>
              </div>
            </div>

            {/* Ações Rápidas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-wave-50 rounded-xl border border-wave-100 hover:bg-wave-100 transition-colors">
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-wave-500" />
                  <div>
                    <p className="text-wave-800">Gerar Boletos do Próximo Mês</p>
                    <p className="text-wave-500 text-sm">Emita boletos para todas as unidades de uma vez</p>
                  </div>
                </div>
                <Button
                  onClick={() => setShowGenerateBoletoModal(true)}
                  className="bg-wave-500 hover:bg-wave-500 text-white"
                >
                  Gerar em Lote
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100 hover:bg-orange-100 transition-colors">
                <div className="flex items-center gap-3">
                  <Send className="w-5 h-5 text-orange-600" />
                  <div>
                    <p className="text-orange-900">Enviar Lembrete de Vencimento</p>
                    <p className="text-orange-600 text-sm">Notificar {unidadesInadimplentes.size} unidade{unidadesInadimplentes.size !== 1 ? 's' : ''} com boletos em atraso</p>
                  </div>
                </div>
                <Button
                  onClick={handleSendBoletoReminder}
                  variant="outline"
                  className="border-orange-300 text-orange-700 hover:bg-orange-200"
                >
                  Enviar Lembretes
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-wave-100 rounded-xl border border-wave-200 hover:bg-wave-100 transition-colors">
                <div className="flex items-center gap-3">
                  <Download className="w-5 h-5 text-wave-400" />
                  <div>
                    <p className="text-wave-400">Exportar Relatório de Boletos</p>
                    <p className="text-wave-400 text-sm">Baixe planilha completa com todos os boletos</p>
                  </div>
                </div>
                <Button
                  onClick={handleExport}
                  variant="outline"
                  className="border-wave-200 text-wave-400 hover:bg-wave-100"
                >
                  Exportar Excel
                </Button>
              </div>
            </div>

            {/* Info sobre processo */}
            <div className="mt-6 p-4 bg-gradient-to-r from-brand-deep to-brand-steel rounded-xl border border-wave-200">
              <div className="flex gap-3">
                <Receipt className="w-5 h-5 text-wave-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-wave-800 mb-2">Como funciona a geração de boletos</h4>
                  <ul className="text-wave-600 text-sm space-y-1 list-disc list-inside">
                    <li>Gere boletos individuais ou em lote para múltiplas unidades</li>
                    <li>Defina valores personalizados (condomínio, água, taxas extras)</li>
                    <li>Moradores recebem notificação automática por e-mail e SMS</li>
                    <li>Após compensação bancária, pagamentos são registrados automaticamente na blockchain</li>
                    <li>Acesse o módulo "Boletos" no menu para gerenciamento detalhado</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conciliação Boletos × Tesouraria (SÍN-010) — apenas gestor. */}
      {isManagerRole && <ConciliacaoPanel />}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 mb-8 relative z-10">
        {/* Balance Evolution */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-wave-100 shadow-lg">
          <h3 className="text-wave-800 text-lg mb-6">Evolução Financeira (Últimos 6 Meses)</h3>
          {balanceData.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-wave-400 text-sm italic">Ainda não há boletos suficientes para montar o gráfico.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={balanceData}>
                <defs>
                  <linearGradient id="colorReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#bfdbfe" />
                <XAxis dataKey="month" stroke="#60a5fa" />
                <YAxis stroke="#60a5fa" tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip 
                  formatter={(value: number) => `R$ ${value.toLocaleString('pt-BR')}`}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '2px solid #3b82f6',
                    borderRadius: '12px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="receitas" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  fill="url(#colorReceitas)"
                  name="Receitas"
                />
                <Area 
                  type="monotone" 
                  dataKey="despesas" 
                  stroke="#f59e0b" 
                  strokeWidth={2}
                  fill="url(#colorDespesas)"
                  name="Despesas"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <p className="text-wave-400 text-xs italic mt-2">
            * Receitas dos boletos pagos e despesas efetivamente pagas por mês. A distribuição
            por categoria está na seção "Despesas" acima; o registro e acompanhamento, em
            "Gestão de Despesas".
          </p>
        </div>
      </div>

      {/* Histórico de Transações (MOR-053) — receitas + despesas, cronológico */}
      <HistoricoTransacoes despesas={despesas} />

      {/* Blockchain Info */}
      <div className="mt-8 bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-6 border border-wave-200 shadow-lg relative z-10">
        <div className="flex items-start gap-3">
          <Wallet className="w-6 h-6 text-wave-500 shrink-0 mt-1" />
          <div>
            <h3 className="text-wave-800 mb-2">Auditoria Automática</h3>
            <p className="text-wave-600 text-sm">
              Todas as movimentações financeiras acima de R$ 5.000 são automaticamente registradas na rede Stellar, 
              criando uma trilha de auditoria imutável e transparente para prestação de contas.
            </p>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
            {showGenerateBoletoModal && (
        <GenerateBoletoModal
          onClose={() => setShowGenerateBoletoModal(false)}
          onGenerate={handleGenerateBoletos}
        />
      )}

      {/* Adicionar Despesa (SÍN-011) — apenas gestor */}
      {isManagerRole && showAddDespesa && (
        <AdicionarDespesaModal
          onClose={() => setShowAddDespesa(false)}
          onCreate={criarDespesa}
        />
      )}
    </div>
  );
}
