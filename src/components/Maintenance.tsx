import { toast } from 'sonner';
import { useState, useMemo, useCallback } from 'react';
import {
  Wrench, CheckCircle, AlertCircle, Calendar, Shield, Bell, Plus,
  X, Clock, ChevronRight, FileText, Send, Eye, ShieldCheck,
  CalendarClock, CircleDot, Info, Building2,
} from 'lucide-react';

import { CreateMaintenanceModal } from './maintenance/CreateMaintenanceModal';
import { SolicitacoesCorretivas } from './maintenance/SolicitacoesCorretivas';
import { InspectionOrderModal } from './maintenance/InspectionOrderModal';
import { BuildingMaintenanceSection } from './maintenance/BuildingMaintenanceSection';
import {
  BUILDING_WARRANTIES,
  BUILDING_COMPLIANCE,
  getWarrantyHealth,
} from './maintenance/buildingMaintenance';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useMaintenanceOrders, type MaintenanceOrder, type UnifiedMaintenanceOrder } from '../hooks/useMaintenanceOrders';
import { acaoMudancaStatus, formatCustoBRL, formatDataHora } from './maintenance/ordemServico';
import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';

// ---------------------------------------------------------------------------
// Componente principal com roteamento por role
// ---------------------------------------------------------------------------

export function Maintenance() {
  const { userProfile } = useUser();
  const canManage = isManager(userProfile.role);

  // RBAC: a GESTÃO da manutenção (criar/editar/concluir OS, abrir vistorias) é
  // renderizada APENAS para perfis gestores (Síndico/Administrador) via
  // ManagerMaintenanceView — este roteamento por perfil é o bloqueio efetivo de
  // qualquer ação, inclusive ao acessar /dashboard/maintenance pela URL.
  // O Morador recebe a MoradorMaintenanceView, que inclui a aba "Prédio":
  // uma visão SOMENTE LEITURA da Manutenção Geral do Prédio (garantias,
  // conformidade e manutenções coletivas) — consulta e acompanhamento, sem
  // qualquer controle de criação/edição/exclusão.
  return canManage ? <ManagerMaintenanceView /> : <MoradorMaintenanceView />;
}

// ===========================================================================
// MORADOR — Preventiva + Corretiva (abas)
// ===========================================================================

const MORADOR_CATEGORIES = [
  'Elétrica',
  'Hidráulica',
  'Infiltração',
  'Pintura',
  'Porta/Janela',
  'Interfone',
  'Iluminação',
  'Outros',
];

// ---------------------------------------------------------------------------
// Modelo — Manutenção Preventiva (itens da unidade)
// ---------------------------------------------------------------------------

type PreventiveStatus = 'em_garantia' | 'programada' | 'em_dia' | 'proxima_inspecao' | 'vencida';

interface PreventiveItem {
  id: string;
  name: string;
  description: string;
  status: PreventiveStatus;
  lastInspection?: string;
  nextInspection?: string;
  warrantyEnd?: string;
  observations?: string;
  unit: string;
}

const PREVENTIVE_STATUS_CONFIG: Record<PreventiveStatus, { label: string; color: string; bg: string; Icon: typeof ShieldCheck }> = {
  em_garantia:      { label: 'Em Garantia',       color: 'text-emerald-700', bg: 'bg-emerald-100', Icon: ShieldCheck },
  programada:       { label: 'Programada',         color: 'text-blue-700',    bg: 'bg-blue-100',    Icon: CalendarClock },
  em_dia:           { label: 'Em Dia',             color: 'text-emerald-700', bg: 'bg-emerald-50',  Icon: CheckCircle },
  proxima_inspecao: { label: 'Próxima Inspeção',   color: 'text-orange-700',  bg: 'bg-orange-100',  Icon: Clock },
  vencida:          { label: 'Vencida',            color: 'text-red-700',     bg: 'bg-red-100',     Icon: AlertCircle },
};

// Dados demo para a unidade 203 (morador demo)
const DEFAULT_PREVENTIVE_ITEMS: PreventiveItem[] = [
  {
    id: 'PREV-001',
    name: 'Ar Condicionado Split — Sala',
    description: 'Limpeza de filtros e verificação de gás refrigerante.',
    status: 'programada',
    lastInspection: '15/03/2026',
    nextInspection: '15/09/2026',
    observations: 'Manutenção semestral conforme contrato.',
    unit: '203',
  },
  {
    id: 'PREV-002',
    name: 'Aquecedor a Gás',
    description: 'Inspeção de segurança e verificação de chama e exaustão.',
    status: 'proxima_inspecao',
    lastInspection: '10/01/2026',
    nextInspection: '10/08/2026',
    observations: 'Inspeção anual obrigatória. Prazo se aproximando.',
    unit: '203',
  },
  {
    id: 'PREV-003',
    name: 'Impermeabilização — Banheiro Social',
    description: 'Garantia construtiva da impermeabilização de piso e box.',
    status: 'em_garantia',
    warrantyEnd: '01/03/2028',
    observations: 'Garantia de 5 anos pela construtora.',
    unit: '203',
  },
  {
    id: 'PREV-004',
    name: 'Porta Corta-Fogo',
    description: 'Verificação de molas, fechamento automático e vedação.',
    status: 'em_dia',
    lastInspection: '20/06/2026',
    nextInspection: '20/12/2026',
    unit: '203',
  },
  {
    id: 'PREV-005',
    name: 'Dedetização da Unidade',
    description: 'Controle de pragas — dedetização periódica programada pelo condomínio.',
    status: 'programada',
    lastInspection: '05/05/2026',
    nextInspection: '05/11/2026',
    observations: 'Agendamento coletivo pelo condomínio, semestral.',
    unit: '203',
  },
];

// ---------------------------------------------------------------------------
// Componente — MoradorMaintenanceView (com abas)
// ---------------------------------------------------------------------------

function MoradorMaintenanceView() {
  const { userProfile } = useUser();
  const [activeTab, setActiveTab] = useState<'preventiva' | 'corretiva' | 'predio'>('preventiva');
  const [selectedPreventive, setSelectedPreventive] = useState<PreventiveItem | null>(null);

  // `allOrders` continua alimentando a aba "Prédio" (manutenção coletiva, MOR-033).
  // A aba "Corretiva" agora é DB-backed (SolicitacoesCorretivas).
  const { allOrders } = useMaintenanceOrders();

  const [preventiveItems] = useLocalStorage<PreventiveItem[]>(
    'wave_preventive_maintenance',
    DEFAULT_PREVENTIVE_ITEMS,
  );

  // Normaliza unidade: "Apto 203" → "203"
  const userUnit = useMemo(() => {
    const raw = userProfile.unit || '';
    return raw.replace(/^apto\s*/i, '').trim();
  }, [userProfile.unit]);

  // --- Preventiva: itens da unidade ---
  const myPreventiveItems = useMemo(() => {
    if (!userUnit) return [];
    return preventiveItems.filter((item) => {
      const itemUnit = (item.unit || '').replace(/^apto\s*/i, '').trim();
      return itemUnit === userUnit;
    });
  }, [preventiveItems, userUnit]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-1">
            Manutenção
          </h1>
          <p className="text-wave-500">
            Acompanhe manutenções e solicite reparos
            {userUnit && <span className="font-medium text-wave-700"> — Unidade {userUnit}</span>}
          </p>
        </div>
      </div>

      {/* Tabs — Preventiva / Corretiva / Prédio */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-1.5 border border-wave-100 mb-6 shadow-sm inline-flex gap-1 w-full sm:w-auto">
        <button
          onClick={() => setActiveTab('preventiva')}
          className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2 ${
            activeTab === 'preventiva'
              ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
              : 'text-wave-500 hover:bg-wave-50'
          }`}
        >
          <Shield className="w-4 h-4" />
          Preventiva
        </button>
        <button
          onClick={() => setActiveTab('corretiva')}
          className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2 ${
            activeTab === 'corretiva'
              ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
              : 'text-wave-500 hover:bg-wave-50'
          }`}
        >
          <Wrench className="w-4 h-4" />
          Corretiva
        </button>
        <button
          onClick={() => setActiveTab('predio')}
          className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl transition-all text-sm font-medium flex items-center justify-center gap-2 ${
            activeTab === 'predio'
              ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
              : 'text-wave-500 hover:bg-wave-50'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Prédio
        </button>
      </div>

      {/* ================================================================= */}
      {/* ABA — PREVENTIVA                                                  */}
      {/* ================================================================= */}
      {activeTab === 'preventiva' && (
        <>
          {/* Resumo rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {([
              { label: 'Em Garantia',     count: myPreventiveItems.filter(i => i.status === 'em_garantia').length, color: 'text-emerald-600' },
              { label: 'Programadas',     count: myPreventiveItems.filter(i => i.status === 'programada').length,  color: 'text-blue-600' },
              { label: 'Próx. Inspeção',  count: myPreventiveItems.filter(i => i.status === 'proxima_inspecao').length, color: 'text-orange-600' },
              { label: 'Vencidas',        count: myPreventiveItems.filter(i => i.status === 'vencida').length,     color: 'text-red-600' },
            ]).map(({ label, count, color }) => (
              <div key={label} className="bg-white/80 backdrop-blur-sm rounded-xl border border-wave-100 p-3 text-center shadow-sm">
                <p className={`text-xl font-bold ${color}`}>{count}</p>
                <p className="text-xs text-wave-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Lista de itens preventivos */}
          {myPreventiveItems.length === 0 ? (
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-12 text-center shadow-sm">
              <Shield className="w-12 h-12 text-wave-300 mx-auto mb-4" />
              <h3 className="text-wave-700 text-lg mb-2">Nenhum item preventivo registrado</h3>
              <p className="text-wave-400 text-sm">
                Itens em garantia, manutenções programadas e inspeções da sua unidade aparecerão aqui.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myPreventiveItems.map((item) => {
                const cfg = PREVENTIVE_STATUS_CONFIG[item.status];
                const StatusIcon = cfg.Icon;
                return (
                  <div
                    key={item.id}
                    className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-sm hover:shadow-md transition-all cursor-pointer"
                    onClick={() => setSelectedPreventive(item)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h3 className="text-wave-800 font-medium truncate">{item.name}</h3>
                        </div>
                        <p className="text-wave-500 text-sm mb-2 line-clamp-2">{item.description}</p>
                        <div className="flex items-center gap-3 text-xs text-wave-400 flex-wrap">
                          {item.lastInspection && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Última: {item.lastInspection}
                            </span>
                          )}
                          {item.nextInspection && (
                            <span className="flex items-center gap-1">
                              <CalendarClock className="w-3 h-3" />
                              Próxima: {item.nextInspection}
                            </span>
                          )}
                          {item.warrantyEnd && (
                            <span className="flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Garantia até: {item.warrantyEnd}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-wave-300" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Info box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-blue-700 text-sm">
              A manutenção preventiva evita que problemas aconteçam. Aqui você acompanha garantias,
              inspeções programadas e manutenções periódicas da sua unidade.
            </p>
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* ABA — CORRETIVA                                                   */}
      {/* ================================================================= */}
      {activeTab === 'corretiva' && (
        <>
          {/* SÍN-026: solicitações do morador em banco, decididas pelo síndico na Central. */}
          <SolicitacoesCorretivas />

          {/* Info box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-blue-700 text-sm">
              A manutenção corretiva resolve problemas que já aconteceram. Aqui você solicita
              reparos e o síndico analisa cada pedido antes de encaminhar.
            </p>
          </div>
        </>
      )}

      {/* ================================================================= */}
      {/* ABA — MANUTENÇÃO GERAL DO PRÉDIO (somente leitura)                */}
      {/* ================================================================= */}
      {activeTab === 'predio' && (
        <BuildingMaintenanceSection orders={allOrders} />
      )}

      {/* Preventive Detail Modal */}
      {selectedPreventive && (
        <PreventiveDetailModal
          item={selectedPreventive}
          onClose={() => setSelectedPreventive(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — Detalhe de Item Preventivo (Morador)
// ---------------------------------------------------------------------------

function PreventiveDetailModal({
  item,
  onClose,
}: {
  item: PreventiveItem;
  onClose: () => void;
}) {
  const cfg = PREVENTIVE_STATUS_CONFIG[item.status];
  const StatusIcon = cfg.Icon;

  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500 rounded-xl">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-blue-900 text-xl">Manutenção Preventiva</h2>
                <p className="text-wave-400 text-sm">{item.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-blue-50 rounded-lg transition-colors">
              <X className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Name & Status */}
          <div>
            <h3 className="text-wave-800 text-lg mb-2">{item.name}</h3>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${cfg.bg} ${cfg.color}`}>
              <StatusIcon className="w-4 h-4" />
              {cfg.label}
            </span>
          </div>

          {/* Description */}
          <div className="bg-wave-50 rounded-xl p-4">
            <p className="text-wave-400 text-xs mb-1.5">Descrição</p>
            <p className="text-wave-700 text-sm">{item.description}</p>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            {item.lastInspection && (
              <div className="bg-wave-50 rounded-xl p-3">
                <p className="text-wave-400 text-xs mb-1">Última Inspeção</p>
                <p className="text-wave-800 text-sm font-medium">{item.lastInspection}</p>
              </div>
            )}
            {item.nextInspection && (
              <div className="bg-wave-50 rounded-xl p-3">
                <p className="text-wave-400 text-xs mb-1">Próxima Inspeção</p>
                <p className="text-wave-800 text-sm font-medium">{item.nextInspection}</p>
              </div>
            )}
            {item.warrantyEnd && (
              <div className="bg-wave-50 rounded-xl p-3">
                <p className="text-wave-400 text-xs mb-1">Garantia até</p>
                <p className="text-wave-800 text-sm font-medium">{item.warrantyEnd}</p>
              </div>
            )}
          </div>

          {/* Observations */}
          {item.observations && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-blue-700 text-sm">{item.observations}</p>
            </div>
          )}
        </div>

        {/* Close */}
        <div className="p-5 border-t border-wave-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-wave-100 text-wave-700 rounded-xl hover:bg-wave-200 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}


// ===========================================================================
// MANAGER — Visão completa: Garantias, Conformidade, OS, Gestão
// ===========================================================================

function ManagerMaintenanceView() {
  const { userProfile } = useUser();
  const [filter, setFilter] = useState<'all' | 'pending' | 'progress' | 'completed'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<any>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  // SÍN-012: OS selecionada para o modal "Ver Detalhes".
  const [selectedOrder, setSelectedOrder] = useState<UnifiedMaintenanceOrder | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useLocalStorage<any[]>('wave_maintenance_requests', []);

  const {
    allOrders,
    maintenanceOrders,
    setMaintenanceOrders,
    inspectionOrders,
    setInspectionOrders,
  } = useMaintenanceOrders();

  // Garantias e conformidade vêm da fonte única compartilhada
  // (buildingMaintenance.ts) — mesma verdade que o Morador consulta na aba
  // "Prédio", evitando divergência entre as duas visões.
  const warranties = BUILDING_WARRANTIES;
  const compliance = BUILDING_COMPLIANCE;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm">Pendente</span>;
      case 'progress':
        return <span className="px-3 py-1 bg-wave-100 text-wave-600 rounded-full text-sm">Em Andamento</span>;
      case 'completed':
        return <span className="px-3 py-1 bg-brand-teal/15 text-brand-teal rounded-full text-sm">Concluída</span>;
      default:
        return null;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'high':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">Alta</span>;
      case 'medium':
        return <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Média</span>;
      case 'low':
        return <span className="px-2 py-1 bg-wave-100 text-wave-600 rounded text-xs">Baixa</span>;
      default:
        return null;
    }
  };

  const filteredOrders = allOrders.filter(order => {
    if (filter === 'all') return true;
    return order.status === filter;
  });

  const handleCreateOrder = (newOrder: any) => {
    setMaintenanceOrders([...maintenanceOrders, newOrder]);
    setShowCreateModal(false);
  };

  const handleOpenInspectionModal = (warranty: any) => {
    setSelectedWarranty(warranty);
    setShowInspectionModal(true);
  };

  const handleCreateInspectionOrder = (newOrder: any) => {
    setInspectionOrders([...inspectionOrders, newOrder]);
    setShowInspectionModal(false);
  };

  const handleCreateRequest = (requestData: any) => {
    const newRequest = {
      id: `REQ-${Date.now()}`,
      ...requestData,
      status: 'solicitado',
      createdAt: new Date().toLocaleDateString('pt-BR')
    };
    setMaintenanceRequests([...maintenanceRequests, newRequest]);
    setShowRequestModal(false);
    alert('✅ Solicitação enviada ao síndico!');
  };

  const handleConvertToOS = (requestId: string) => {
    const request = maintenanceRequests.find((r: any) => r.id === requestId);
    if (!request) return;

    const newOS = {
      id: `OS-${Date.now().toString().slice(-3)}`,
      title: request.title,
      priority: request.priority,
      status: 'pending' as const,
      openedDate: new Date().toLocaleDateString('pt-BR'),
      assignedTo: null,
      category: request.category,
      hasDocument: false,
      fromRequest: true
    };

    setMaintenanceOrders([...maintenanceOrders, newOS]);
    setMaintenanceRequests(maintenanceRequests.filter((r: any) => r.id !== requestId));
    alert('✅ Ordem de Serviço criada!');
  };

  // Count morador-originated orders pending review
  const moradorPendingOrders = allOrders.filter(
    (o) => (o as MaintenanceOrder).origin === 'morador' && o.status === 'pending'
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 relative z-10">
        <div>
          <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-2">Manutenção Preditiva</h1>
          <p className="text-wave-500">Gestão inteligente de garantias, manutenções e conformidade</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="px-4 py-3 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:from-wave-700 hover:to-wave-500 transition-all shadow-lg flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Nova OS
        </button>
      </div>

      {/* Morador Pending Alert */}
      {moradorPendingOrders.length > 0 && (
        <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3 relative z-10">
          <Bell className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-orange-800 font-medium text-sm">
              {moradorPendingOrders.length} solicitaç{moradorPendingOrders.length === 1 ? 'ão' : 'ões'} de moradores aguardando análise
            </p>
            <p className="text-orange-600 text-xs mt-0.5">
              {moradorPendingOrders.map((o) => `${o.id} — ${(o as MaintenanceOrder).createdByName || 'Morador'} (Un. ${(o as MaintenanceOrder).unit || '?'})`).join(' • ')}
            </p>
          </div>
        </div>
      )}

      {/* Warranties Section */}
      <div className="mb-8 relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-wave-500" />
          <h2 className="text-wave-800 text-xl">Garantias Construtivas</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {warranties.map((warranty) => {
            const statusType = getWarrantyHealth(warranty.daysRemaining);
            return (
              <div
                key={warranty.id}
                className={`bg-white/80 backdrop-blur-sm rounded-2xl border-2 p-6 shadow-lg ${
                  statusType === 'critical' ? 'border-red-300' :
                  statusType === 'warning' ? 'border-orange-300' :
                  'border-wave-100'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-wave-800 flex-1">{warranty.system}</h3>
                  {statusType === 'critical' ? (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  ) : statusType === 'warning' ? (
                    <Bell className="w-5 h-5 text-orange-500" />
                  ) : (
                    <CheckCircle className="w-5 h-5 text-brand-teal" />
                  )}
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-wave-500">Tipo:</span>
                    <span className="text-wave-800">{warranty.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-wave-500">Vencimento:</span>
                    <span className="text-wave-800">{warranty.endDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-wave-500">Fornecedor:</span>
                    <span className="text-wave-800 text-xs">{warranty.supplier}</span>
                  </div>
                </div>

                <div className={`p-3 rounded-xl text-center ${
                  statusType === 'critical' ? 'bg-red-100 text-red-900' :
                  statusType === 'warning' ? 'bg-orange-100 text-orange-900' :
                  'bg-brand-teal/15 text-brand-navy'
                }`}>
                  <p className="text-2xl font-bold mb-1">{warranty.daysRemaining}</p>
                  <p className="text-sm">dias restantes</p>
                </div>

                {statusType !== 'good' && (
                  <button
                    className="w-full mt-4 py-2 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-lg hover:from-wave-700 hover:to-wave-500 transition-all text-sm shadow-lg"
                    onClick={() => handleOpenInspectionModal(warranty)}
                  >
                    Abrir OS de Vistoria
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Compliance Section */}
      <div className="mb-8 relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-wave-500" />
          <h2 className="text-wave-800 text-xl">Conformidade Legal</h2>
        </div>

        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 shadow-lg">
          <div className="space-y-4">
            {compliance.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-4 bg-wave-50 rounded-xl">
                <div className="flex-1">
                  <h3 className="text-wave-800 mb-2">{item.name}</h3>
                  <div className="flex gap-4 text-sm text-wave-500">
                    <span>Válido até: {item.validUntil}</span>
                    <span>•</span>
                    <span>{item.authority}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold mb-1 ${
                    item.status === 'warning' ? 'text-orange-600' : 'text-brand-teal'
                  }`}>
                    {item.daysRemaining}
                  </p>
                  <p className="text-sm text-wave-500">dias</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Maintenance Orders */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-5 h-5 text-wave-500" />
          <h2 className="text-wave-800 text-xl">Ordens de Serviço</h2>
        </div>

        {/* Filters */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-wave-100 mb-6 shadow-lg">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'all'
                  ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                  : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              Todas ({allOrders.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'pending'
                  ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                  : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              Pendentes
            </button>
            <button
              onClick={() => setFilter('progress')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'progress'
                  ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                  : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              Em Andamento
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-4 py-2 rounded-xl transition-all ${
                filter === 'completed'
                  ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
                  : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              Concluídas
            </button>
          </div>
        </div>

        {/* Orders List */}
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div key={order.id} className={`bg-white/80 backdrop-blur-sm rounded-2xl border p-6 shadow-lg hover:shadow-xl transition-all ${
              order.isInspection ? 'border-2 border-wave-200 bg-gradient-to-br from-white to-wave-500/50' : 'border border-wave-100'
            }`}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-wave-800 text-lg">{order.title}</h3>
                    {getPriorityBadge(order.priority)}
                    {order.isInspection && (
                      <span className="px-3 py-1 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-full text-xs flex items-center gap-1 shadow-lg">
                        <Shield className="w-3 h-3" />
                        Vistoria
                      </span>
                    )}
                    {(order as MaintenanceOrder).origin === 'morador' && (
                      <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                        Solicitação do Morador
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-wave-500 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {order.openedDate}
                    </span>
                    <span>•</span>
                    <span>{order.category}</span>
                    {order.assignedTo && (
                      <>
                        <span>•</span>
                        <span>{order.assignedTo}</span>
                      </>
                    )}
                    {(order as MaintenanceOrder).unit && (
                      <>
                        <span>•</span>
                        <span>Un. {(order as MaintenanceOrder).unit}</span>
                      </>
                    )}
                    {(order as MaintenanceOrder).createdByName && (
                      <>
                        <span>•</span>
                        <span>{(order as MaintenanceOrder).createdByName}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {order.hasDocument && (
                    <span className="px-3 py-1 bg-wave-100 text-wave-600 rounded-full text-xs">
                      Com Laudo
                    </span>
                  )}
                  {getStatusBadge(order.status)}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedOrder(order)}
                  className="flex-1 py-2 bg-wave-100 text-wave-600 rounded-xl hover:bg-wave-200 transition-all inline-flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  Ver Detalhes
                </button>
                {order.status !== 'completed' && (
                  <button
                    onClick={() => {
                      const nextStatus = order.status === 'pending' ? 'progress' : 'completed';
                      const label = nextStatus === 'progress' ? 'Em Andamento' : 'Concluída';
                      // Registra a alteração no histórico da OS (quem/quando/o quê) — SÍN-012.
                      const entry = {
                        at: new Date().toISOString(),
                        action: acaoMudancaStatus(nextStatus),
                        by: userProfile.name || 'Gestor',
                      };
                      setMaintenanceOrders((prev) => prev.map((o) => o.id === order.id
                        ? { ...o, status: nextStatus, history: [...(o.history ?? []), entry] }
                        : o));
                      toast.success(`OS ${order.id} atualizada para: ${label}`);
                    }}
                    className="flex-1 py-2 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-xl hover:opacity-90 transition-all shadow-lg text-sm"
                  >
                    {order.status === 'pending' ? 'Iniciar OS' : 'Concluir OS'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blockchain Info */}
      <div className="mt-8 bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-6 border border-wave-200 shadow-lg relative z-10">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-wave-500 shrink-0 mt-1" />
          <div>
            <h3 className="text-wave-800 mb-2">Registro Imutável</h3>
            <p className="text-wave-600 text-sm">
              Todas as vistoria de garantias e ordens de serviço críticas são registradas
              automaticamente na rede Stellar, criando prova irrefutável de diligência e boa-fé.
            </p>
          </div>
        </div>
      </div>

      {/* Order Detail Modal (SÍN-012) — abre os detalhes da OS selecionada. */}
      {selectedOrder && (
        <ManagerOrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Create Maintenance Modal */}
      {showCreateModal && (
        <CreateMaintenanceModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateOrder}
        />
      )}

      {/* Inspection Order Modal */}
      {showInspectionModal && selectedWarranty && (
        <InspectionOrderModal
          isOpen={showInspectionModal}
          onClose={() => setShowInspectionModal(false)}
          onSubmit={handleCreateInspectionOrder}
          warranty={selectedWarranty}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal — Detalhes da Ordem de Serviço (Síndico) — SÍN-012
//
// Abre os dados da OS SELECIONADA (recebe o objeto completo, com o id). Mostra
// descrição, solicitante, unidade, prioridade, status, prestador, custos
// (previsto/realizado), anexos e o histórico de alterações (o quê/quando/quem).
// Campos ainda não preenchidos recebem uma indicação adequada, sem esconder os
// demais dados.
// ---------------------------------------------------------------------------

const OS_STATUS_META: Record<
  'pending' | 'progress' | 'completed',
  { label: string; bg: string; color: string }
> = {
  pending: { label: 'Pendente', bg: 'bg-orange-100', color: 'text-orange-700' },
  progress: { label: 'Em Andamento', bg: 'bg-wave-100', color: 'text-wave-600' },
  completed: { label: 'Concluída', bg: 'bg-brand-teal/15', color: 'text-brand-teal' },
};

const OS_PRIORITY_META: Record<'high' | 'medium' | 'low', { label: string; color: string }> = {
  high: { label: 'Urgente', color: 'text-red-600' },
  medium: { label: 'Média', color: 'text-orange-600' },
  low: { label: 'Baixa', color: 'text-blue-600' },
};

function InfoCell({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-wave-50 rounded-xl p-3">
      <p className="text-wave-400 text-xs mb-1">{label}</p>
      <p className={`text-sm font-medium ${valueClass ?? 'text-wave-800'}`}>{value}</p>
    </div>
  );
}

function ManagerOrderDetailModal({
  order,
  onClose,
}: {
  order: UnifiedMaintenanceOrder;
  onClose: () => void;
}) {
  const statusMeta = OS_STATUS_META[order.status] ?? OS_STATUS_META.pending;
  const priorityMeta = OS_PRIORITY_META[order.priority] ?? OS_PRIORITY_META.low;

  // Histórico: usa o registrado; se vazio, deriva o evento de abertura para não
  // deixar a seção em branco (indicação adequada).
  const historico =
    order.history && order.history.length > 0
      ? order.history
      : [{ at: order.openedDate, action: 'Ordem de serviço aberta', by: order.createdByName ?? '—' }];

  const anexos = order.attachments && order.attachments.length > 0
    ? order.attachments
    : order.hasDocument
      ? ['Documento anexado']
      : [];

  return (
    <div className="fixed inset-0 bg-blue-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-blue-100 p-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-brand-deep to-brand-steel rounded-xl">
                <Eye className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-blue-900 text-xl">Detalhes da Ordem de Serviço</h2>
                <p className="text-wave-400 text-sm">{order.id}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-blue-50 rounded-lg transition-colors" aria-label="Fechar">
              <X className="w-5 h-5 text-blue-600" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Título + status */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-wave-800 text-lg">{order.title}</h3>
              {order.isInspection && (
                <span className="px-2.5 py-0.5 bg-gradient-to-r from-brand-deep to-brand-steel text-white rounded-full text-xs flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Vistoria
                </span>
              )}
              {order.origin === 'morador' && (
                <span className="px-2.5 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                  Solicitação do Morador
                </span>
              )}
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm ${statusMeta.bg} ${statusMeta.color}`}>
              <CircleDot className="w-4 h-4" />
              {statusMeta.label}
            </span>
          </div>

          {/* Grade de informações */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCell label="Categoria" value={order.category || 'Não informado'} />
            <InfoCell label="Prioridade" value={priorityMeta.label} valueClass={priorityMeta.color} />
            <InfoCell label="Solicitante" value={order.createdByName || 'Não informado'} />
            <InfoCell label="Unidade" value={order.unit ? `Unidade ${order.unit}` : 'Não aplicável'} />
            <InfoCell label="Data de abertura" value={order.openedDate || 'Não informado'} />
            <InfoCell label="Prestador designado" value={order.assignedTo || 'Aguardando designação'} />
            <InfoCell label="Custo previsto" value={formatCustoBRL(order.costEstimated)} />
            <InfoCell label="Custo realizado" value={formatCustoBRL(order.costActual)} />
          </div>

          {/* Descrição */}
          <div className="bg-wave-50 rounded-xl p-4">
            <p className="text-wave-400 text-xs mb-1.5">Descrição</p>
            <p className="text-wave-700 text-sm whitespace-pre-wrap">
              {order.description || 'Sem descrição informada.'}
            </p>
          </div>

          {/* Anexos */}
          <div>
            <p className="text-wave-700 text-sm font-medium mb-2">Anexos</p>
            {anexos.length === 0 ? (
              <p className="text-wave-400 text-sm">Nenhum anexo relacionado.</p>
            ) : (
              <ul className="space-y-2">
                {anexos.map((nome, i) => (
                  <li key={i} className="flex items-center gap-2 bg-wave-50 rounded-xl p-3">
                    <FileText className="w-4 h-4 text-wave-500 shrink-0" />
                    <span className="text-wave-700 text-sm truncate">{nome}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Histórico de alterações */}
          <div>
            <p className="text-wave-700 text-sm font-medium mb-3">Histórico de alterações</p>
            <ol className="space-y-0">
              {historico.map((h, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-6 h-6 rounded-full bg-wave-100 flex items-center justify-center shrink-0">
                      <Clock className="w-3.5 h-3.5 text-wave-500" />
                    </div>
                    {i < historico.length - 1 && <div className="w-0.5 h-8 bg-wave-200" />}
                  </div>
                  <div className="pt-0.5 pb-3">
                    <p className="text-wave-800 text-sm">{h.action}</p>
                    <p className="text-wave-400 text-xs mt-0.5">
                      {formatDataHora(h.at)} · {h.by}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Rodapé */}
        <div className="p-5 border-t border-wave-100">
          <button
            onClick={onClose}
            className="w-full py-3 bg-wave-100 text-wave-700 rounded-xl hover:bg-wave-200 transition-all"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
