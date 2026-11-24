import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { Receipt, DollarSign, CheckCircle, Clock, AlertCircle, Plus, TrendingUp } from 'lucide-react';
import { IssueBoletoModal } from './IssueBoletoModal';
import { BoletoDetailsModal } from './BoletoDetailsModal';
import { PagamentoStellarModal } from './PagamentoStellarModal';
import { AbertosSection } from './boletos/AbertosSection';
import { HistoricoSection } from './boletos/HistoricoSection';
import { ComprovanteModal } from './boletos/ComprovanteModal';
import { RegistrarAcordoModal } from './boletos/RegistrarAcordoModal';
import type { BoletoFull } from './boletos/boletoTypes';
import { isPago } from './boletos/boletoFormat';
import { listBoletosAction, emitirBoletoAction, atualizarBoletoAction, enviarLembreteBoletoAction, registrarAcordoAction } from '@/app/actions/boletos';
import { useBlockchainAutoRegistry } from '../hooks/useBlockchainAutoRegistry';
import { isManager, isPlatformAdmin, type Role } from '@/lib/rbac';

interface Boleto {
  id: string;
  unitNumber: string;
  unitOwner: string;
  referenceMonth: string; // formato: 'YYYY-MM'
  dueDate: string;        // formato: 'YYYY-MM-DD' (sem timezone/hora)
  amount: number;
  barcode: string;
  status: 'pending' | 'paid' | 'compensated' | 'blockchain_registered' | 'overdue';
  issuedAt: string;
  issuedBy: string;
  paidAt?: string;
  compensatedAt?: string;
  blockchainHash?: string;
  stellarExplorerUrl?: string;
  anchorTxHash?: string;
  contentHash?: string;
  blockchainRegisteredAt?: string;
  paymentMethod?: 'pix' | 'card' | 'boleto';
  description: string;
  details: {
    condominiumFee: number;
    waterFee: number;
    reserveFund: number;
    otherFees: number;
  };
  // Gestão de cobrança pelo síndico (SÍN-009).
  lastReminderAt?: string;
  acordoParcelas?: number;
  acordoPrimeiraParcela?: string;
  acordoObservacao?: string;
  acordoRegistradoEm?: string;
  acordoRegistradoPor?: string;
}

interface BoletosProps {
  userProfile: {
    name: string;
    role: Role;
    unit?: string;
  };
}

// ---------------------------------------------------------------------------
// FIX (bug de timezone / off-by-one na Data de Vencimento):
//
// `new Date('2026-07-10')` é interpretado pelo JS como meia-noite UTC, não
// meia-noite no horário local. No Brasil (UTC-3), isso equivale a
// 2026-07-09T21:00 no horário local. Duas consequências:
//
//  1) `.toLocaleDateString('pt-BR')` mostrava a data ERRADA (um dia antes).
//  2) O boleto virava "Vencido" a partir das 21h do dia anterior ao
//     vencimento real, em vez de virar à meia-noite local do dia seguinte.
//
// As funções abaixo tratam `dueDate` como texto puro ('YYYY-MM-DD'), sem
// nunca passar por `new Date(string)`, eliminando o problema de timezone.
// Também centralizam a lógica que antes estava duplicada em 3 lugares.
// ---------------------------------------------------------------------------

// Data de "hoje" no horário local, já no formato 'YYYY-MM-DD'
function getTodayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA'); // en-CA => YYYY-MM-DD
}

// Compara datas como texto (funciona pois o formato ISO é lexicograficamente
// ordenável) — nunca usa new Date() sobre a string do boleto
function isPastDue(dueDate: string): boolean {
  return dueDate < getTodayLocalISO();
}

function isBoletoOverdue(boleto: Pick<Boleto, 'status' | 'dueDate'>): boolean {
  return boleto.status === 'pending' && isPastDue(boleto.dueDate);
}

// Formata 'YYYY-MM-DD' para 'DD/MM/YYYY' sem passar por new Date()
function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function Boletos({ userProfile }: BoletosProps) {
  // Dados agora vem do PostgreSQL (migracao da fundacao). Antes: useLocalStorage.
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listBoletosAction()
      .then((list) => { if (alive) setBoletos(list as Boleto[]); })
      .catch((err) => console.error('Falha ao carregar boletos', err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const [activeTab, setActiveTab] = useState<'abertos' | 'historico'>('abertos');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedBoleto, setSelectedBoleto] = useState<Boleto | null>(null);
  const [boletoParaPagar, setBoletoParaPagar] = useState<Boleto | null>(null);
  const [comprovanteBoleto, setComprovanteBoleto] = useState<Boleto | null>(null);
  const [boletoAcordo, setBoletoAcordo] = useState<Boleto | null>(null);
  const { registerPayment } = useBlockchainAutoRegistry();

  const canIssueBoleto = isManager(userProfile.role);
  const isAdmin = isPlatformAdmin(userProfile.role);
  // SÍN-009: o gestor (Síndico/Admin) NÃO paga boletos de terceiros. Apenas o
  // morador paga o próprio. Gestor vê ações de cobrança (lembrete/acordo).
  const canPay = !isManager(userProfile.role);

  async function handleEnviarLembrete(boleto: Boleto) {
    const res = await enviarLembreteBoletoAction(boleto.id);
    if (res.ok) {
      setBoletos((prev) => prev.map((b) => (b.id === boleto.id ? { ...b, ...(res.boleto as Boleto) } : b)));
      toast.success('Lembrete enviado!', { description: `Cobrança da unidade ${boleto.unitNumber} registrada.` });
    } else {
      toast.error(res.error || 'Não foi possível enviar o lembrete.');
    }
  }

  async function handleRegistrarAcordo(input: { parcelas: number; primeiraParcela: string; observacao: string }): Promise<boolean> {
    if (!boletoAcordo) return false;
    const res = await registrarAcordoAction(boletoAcordo.id, input);
    if (res.ok) {
      setBoletos((prev) => prev.map((b) => (b.id === boletoAcordo.id ? { ...b, ...(res.boleto as Boleto) } : b)));
      toast.success('Acordo registrado!', { description: `Parcelamento em ${input.parcelas}x registrado no boleto.` });
      return true;
    }
    toast.error(res.error || 'Não foi possível registrar o acordo.');
    return false;
  }

  // Callback de sucesso do pagamento Stellar
  async function handlePagamentoStellarSucesso(result: any) {
    if (!boletoParaPagar) return;

    // Salva o txHash REAL da transação Stellar (da liquidação ou da âncora)
    // Este hash é verificável publicamente em stellar.expert
    const stellarTxHash = result.settlement?.stellarTxHash ?? '';
    const anchorTxHash  = result.receipt?.anchorTxHash ?? '';
    const contentHash   = result.receipt?.contentHash ?? '';
    const explorerUrl   = result.settlement?.explorerUrl ?? result.receipt?.anchorExplorerUrl ?? '';
    // Forma de pagamento escolhida no modal (pix/card/boleto).
    const method        = result.method as ('pix' | 'card' | 'boleto' | undefined);

    setBoletos(prev => prev.map(b =>
      b.id === boletoParaPagar.id
        ? {
            ...b,
            status: 'blockchain_registered' as const,
            paidAt: new Date().toISOString().split('T')[0],
            compensatedAt: new Date().toISOString().split('T')[0],
            // Salva o txHash da liquidação Stellar — 64 chars hex, sem 0x
            blockchainHash: stellarTxHash,
            blockchainRegisteredAt: new Date().toISOString(),
            // Forma de pagamento (para o Histórico de Pagamentos)
            paymentMethod: method,
            // Campos adicionais para auditoria
            stellarExplorerUrl: explorerUrl,
            anchorTxHash,
            contentHash,
          }
        : b
    ));

    toast.success('Pagamento registrado!', {
      description: 'Pagamento confirmado com sucesso.',
      action: explorerUrl ? {
        label: 'Verificar',
        onClick: () => window.open(explorerUrl, '_blank'),
      } : undefined,
      duration: 6000,
    });

    // Persiste o pagamento + ancora Stellar no PostgreSQL.
    await atualizarBoletoAction(boletoParaPagar.id, {
      status: 'blockchain_registered',
      paidAt: new Date().toISOString().split('T')[0],
      compensatedAt: new Date().toISOString().split('T')[0],
      blockchainHash: stellarTxHash,
      blockchainRegisteredAt: new Date().toISOString(),
      paymentMethod: method ?? null,
      stellarExplorerUrl: explorerUrl,
    });
  }

  const handleIssueBoleto = async (data: Omit<Boleto, 'id' | 'issuedAt' | 'issuedBy' | 'status' | 'barcode'>) => {
    setShowIssueModal(false);
    const novo = await emitirBoletoAction(
      {
        unitNumber: data.unitNumber,
        unitOwner: data.unitOwner,
        referenceMonth: data.referenceMonth,
        dueDate: data.dueDate,
        amount: data.amount,
        description: data.description,
        details: data.details,
      },
      userProfile.name,
    );
    if (novo) {
      setBoletos((prev) => [novo as Boleto, ...prev]);
      toast.success('Boleto emitido com sucesso!');
    } else {
      toast.error('Não foi possível emitir o boleto.');
    }
  };

  const handleSimulateCompensation = async (boletoId: string) => {
    const boleto = boletos.find(b => b.id === boletoId);
    if (!boleto) return;

    // Atualizar status para compensado
    setBoletos(boletos.map(b => 
      b.id === boletoId
        ? {
            ...b,
            status: 'compensated' as const,
            compensatedAt: new Date().toISOString().split('T')[0]
          }
        : b
    ));
    
    toast.success('Compensação confirmada!', { description: 'Comprovante gerado com sucesso.' });
    
    // Registrar pagamento na blockchain automaticamente
    const record = await registerPayment({
      boletoId: boleto.id,
      unitNumber: boleto.unitNumber,
      amount: boleto.amount,
      referenceMonth: boleto.referenceMonth
    });

    // Atualizar boleto com dados da blockchain
    setBoletos(prevBoletos => prevBoletos.map(b =>
      b.id === boletoId
        ? {
            ...b,
            status: 'blockchain_registered' as const,
            blockchainHash: record.txHash,
            blockchainRegisteredAt: record.timestamp
          }
        : b
    ));

    // Persiste a compensacao + registro Stellar no PostgreSQL.
    await atualizarBoletoAction(boletoId, {
      status: 'blockchain_registered',
      compensatedAt: new Date().toISOString().split('T')[0],
      blockchainHash: record.txHash,
      blockchainRegisteredAt: record.timestamp,
    });
  };

  // Normaliza o número da unidade do usuário (ex: "Apto 203" → "203")
  const normalizedUserUnit = (userProfile.unit ?? '')
    .replace(/[^0-9]/g, '').trim();

  // Boletos visíveis: o morador vê só a própria unidade; síndico/admin veem todos.
  const unitBoletos = boletos.filter(boleto => {
    if (!canIssueBoleto && normalizedUserUnit && boleto.unitNumber !== normalizedUserUnit) {
      return false;
    }
    return true;
  });

  // Seção "Em Aberto": ainda não pagos, ordenados pelo vencimento mais próximo.
  const abertos = unitBoletos
    .filter(b => !isPago(b))
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));

  // Seção "Histórico": pagos, do pagamento mais recente para o mais antigo.
  const pagos = unitBoletos
    .filter(isPago)
    .sort((a, b) => {
      const da = a.paidAt || a.compensatedAt || '';
      const db = b.paidAt || b.compensatedAt || '';
      return db.localeCompare(da);
    });

  const totalPending = unitBoletos.filter(b => b.status === 'pending').reduce((sum, b) => sum + b.amount, 0);
  const totalPaid = unitBoletos.filter(b => b.status === 'blockchain_registered').reduce((sum, b) => sum + b.amount, 0);
  const totalOverdue = unitBoletos.filter(isBoletoOverdue).length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">
            <Clock className="w-4 h-4" />
            Pendente
          </span>
        );
      case 'paid':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-wave-100 text-wave-600 rounded-full text-sm">
            <DollarSign className="w-4 h-4" />
            Pago - Aguardando Compensação
          </span>
        );
      case 'compensated':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm animate-pulse">
            <TrendingUp className="w-4 h-4" />
            Processando
          </span>
        );
      case 'blockchain_registered':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-brand-teal/15 text-brand-teal rounded-full text-sm">
            <CheckCircle className="w-4 h-4" />
            Pago
          </span>
        );
      case 'overdue':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm">
            <AlertCircle className="w-4 h-4" />
            Vencido
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <span className="inline-flex items-center gap-2 mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
            Cobranças
          </span>
          <h1 className="font-display font-normal text-brand-navy text-2xl sm:text-3xl mb-2">Boletos de Condomínio</h1>
          <p className="text-wave-500">
            Gestão completa de cobranças e pagamentos do condomínio
          </p>
        </div>
        {canIssueBoleto && (
          <button
            onClick={() => setShowIssueModal(true)}
            className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Emitir Boleto
          </button>
        )}
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8 relative z-10">
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 rounded-xl">
              <Clock className="w-6 h-6 text-orange-600" />
            </div>
            <span className="font-mono text-3xl text-brand-ink">
              R$ {totalPending.toFixed(2).replace('.', ',')}
            </span>
          </div>
          <h3 className="text-wave-800">A Receber</h3>
          <p className="text-wave-500 text-sm">Boletos pendentes</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-brand-teal/15 rounded-xl">
              <CheckCircle className="w-6 h-6 text-brand-teal" />
            </div>
            <span className="font-mono text-3xl text-brand-ink">
              R$ {totalPaid.toFixed(2).replace('.', ',')}
            </span>
          </div>
          <h3 className="text-wave-800">Recebido</h3>
          <p className="text-wave-500 text-sm">Pagos e verificados</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-red-100 rounded-xl">
              <AlertCircle className="w-6 h-6 text-red-600" />
            </div>
            <span className="font-mono text-3xl text-brand-ink">{totalOverdue}</span>
          </div>
          <h3 className="text-wave-800">Vencidos</h3>
          <p className="text-wave-500 text-sm">Requer atenção</p>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-wave-100 rounded-xl">
              <Receipt className="w-6 h-6 text-wave-500" />
            </div>
            <span className="font-mono text-3xl text-brand-ink">{unitBoletos.length}</span>
          </div>
          <h3 className="text-wave-800">Total de Boletos</h3>
          <p className="text-wave-500 text-sm">Histórico completo</p>
        </div>
      </div>

      {/* Abas: Boletos em Aberto / Histórico de Pagamentos */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-2 border border-wave-100 mb-6 shadow-lg relative z-10 flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => setActiveTab('abertos')}
          className={`flex-1 px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'abertos'
              ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
              : 'bg-transparent text-wave-500 hover:bg-wave-50'
          }`}
        >
          <Clock className="w-5 h-5" />
          Boletos em Aberto ({abertos.length})
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`flex-1 px-4 py-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            activeTab === 'historico'
              ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
              : 'bg-transparent text-wave-500 hover:bg-wave-50'
          }`}
        >
          <CheckCircle className="w-5 h-5" />
          Histórico de Pagamentos ({pagos.length})
        </button>
      </div>

      {/* Conteúdo da aba ativa */}
      <div className="relative z-10">
        {loading ? (
          <div className="rounded-2xl border border-wave-100 bg-white/80 p-12 text-center text-wave-500 shadow-lg backdrop-blur-sm">
            Carregando boletos...
          </div>
        ) : activeTab === 'abertos' ? (
          <AbertosSection
            boletos={abertos}
            canPay={canPay}
            onVerDetalhes={(b) => setSelectedBoleto(b as Boleto)}
            onPagar={(b) => setBoletoParaPagar(b as Boleto)}
            onEnviarLembrete={(b) => handleEnviarLembrete(b as Boleto)}
            onRegistrarAcordo={(b) => setBoletoAcordo(b as Boleto)}
          />
        ) : (
          <HistoricoSection
            boletos={pagos}
            onVerComprovante={(b) => setComprovanteBoleto(b as Boleto)}
            onVerDetalhes={(b) => setSelectedBoleto(b as Boleto)}
          />
        )}
      </div>

      {/* Info Box */}
      <div className="mt-8 bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-6 border border-wave-200 shadow-lg relative z-10">
        <div className="flex items-start gap-3">
          <Receipt className="w-6 h-6 text-wave-500 shrink-0 mt-1" />
          <div>
            <h3 className="text-wave-800 mb-2">Como funciona o pagamento</h3>
            <div className="bg-white rounded-xl p-4">
              <ol className="list-decimal list-inside text-wave-600 text-sm space-y-2">
                <li><strong>Emissão:</strong> Síndico emite o boleto → Morador recebe notificação</li>
                <li><strong>Pagamento:</strong> Escolha Pix, Cartão ou Boleto Bancário</li>
                <li><strong>Confirmação:</strong> Pagamento processado em segundos</li>
                <li><strong>Comprovante:</strong> Gerado automaticamente com protocolo único</li>
                <li><strong>Transparência:</strong> Comprovante verificável por qualquer parte ✅</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showIssueModal && (
        <IssueBoletoModal
          onClose={() => setShowIssueModal(false)}
          onIssue={handleIssueBoleto}
        />
      )}

      {selectedBoleto && (
        <BoletoDetailsModal
          boleto={selectedBoleto}
          onClose={() => setSelectedBoleto(null)}
          onPagar={() => setBoletoParaPagar(selectedBoleto)}
          onSimulateCompensation={handleSimulateCompensation}
          canPagar={canPay && selectedBoleto.status === 'pending'}
          canSimulateCompensation={isAdmin && selectedBoleto.status === 'paid'}
        />
      )}

      {boletoParaPagar && (
        <PagamentoStellarModal
          boleto={boletoParaPagar}
          payerName={userProfile.name}
          onClose={() => setBoletoParaPagar(null)}
          onSuccess={(result) => {
            handlePagamentoStellarSucesso(result);
            setBoletoParaPagar(null);
          }}
        />
      )}

      {comprovanteBoleto && (
        <ComprovanteModal
          boleto={comprovanteBoleto}
          onClose={() => setComprovanteBoleto(null)}
        />
      )}

      {boletoAcordo && (
        <RegistrarAcordoModal
          boleto={boletoAcordo as BoletoFull}
          onSubmit={handleRegistrarAcordo}
          onClose={() => setBoletoAcordo(null)}
        />
      )}
    </div>
  );
}
