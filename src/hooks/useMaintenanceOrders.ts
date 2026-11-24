'use client';

import { useLocalStorage } from './useLocalStorage';
import type { InspectionOrder } from '@/components/maintenance/InspectionOrderModal';
import type { MaintenanceHistoryEntry } from '@/components/maintenance/ordemServico';

export interface MaintenanceOrder {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'progress' | 'completed';
  openedDate: string;
  assignedTo: string | null;
  category: string;
  hasDocument: boolean;
  description?: string;
  location?: string;
  unit?: string;
  origin?: 'condominio' | 'morador';
  createdByName?: string;
  createdById?: string;
  // SÍN-012 — detalhes da OS: custos, anexos e histórico de alterações.
  costEstimated?: number; // custo previsto (BRL)
  costActual?: number; // custo realizado (BRL)
  attachments?: string[]; // nomes dos anexos relacionados
  history?: MaintenanceHistoryEntry[]; // rastreabilidade: o quê / quando / quem
}

export interface UnifiedMaintenanceOrder extends MaintenanceOrder {
  isInspection: boolean;
  inspectionData?: InspectionOrder;
}

const DEFAULT_MAINTENANCE_ORDERS: MaintenanceOrder[] = [
  {
    id: 'OS-001',
    title: 'Reparo Interfone Apto 504',
    priority: 'medium',
    status: 'completed',
    openedDate: '28/11/2025',
    assignedTo: 'João Técnico',
    category: 'Elétrica',
    hasDocument: true,
    description: 'Interfone do apartamento 504 sem áudio. Morador relatou que não escuta a portaria ao ser chamado.',
    unit: '504',
    origin: 'morador',
    createdByName: 'Maria Santos',
    costEstimated: 180,
    costActual: 150,
    attachments: ['laudo-interfone-504.pdf'],
    history: [
      { at: '2025-11-25T09:10:00.000Z', action: 'Ordem de serviço aberta', by: 'Maria Santos' },
      { at: '2025-11-26T14:00:00.000Z', action: 'Prestador designado: João Técnico', by: 'João Silva' },
      { at: '2025-11-27T11:30:00.000Z', action: 'Status alterado para "Em Andamento"', by: 'João Silva' },
      { at: '2025-11-28T16:20:00.000Z', action: 'Status alterado para "Concluída"', by: 'João Silva' },
    ],
  },
  {
    id: 'OS-002',
    title: 'Vistoria Preventiva Elevador A',
    priority: 'high',
    status: 'progress',
    openedDate: '01/12/2025',
    assignedTo: 'Atlas Elevadores',
    category: 'Equipamento',
    hasDocument: false,
    description: 'Vistoria preventiva mensal do elevador social (Torre A) conforme contrato de manutenção.',
    origin: 'condominio',
    createdByName: 'João Silva',
    costEstimated: 900,
    history: [
      { at: '2025-12-01T08:00:00.000Z', action: 'Ordem de serviço aberta', by: 'João Silva' },
      { at: '2025-12-01T08:05:00.000Z', action: 'Prestador designado: Atlas Elevadores', by: 'João Silva' },
      { at: '2025-12-02T10:15:00.000Z', action: 'Status alterado para "Em Andamento"', by: 'João Silva' },
    ],
  },
  {
    id: 'OS-003',
    title: 'Troca de Lâmpadas Garagem',
    priority: 'low',
    status: 'pending',
    openedDate: '03/12/2025',
    assignedTo: null,
    category: 'Iluminação',
    hasDocument: false,
    description: 'Substituição das lâmpadas queimadas no subsolo 2 da garagem.',
    origin: 'condominio',
    createdByName: 'João Silva',
    history: [
      { at: '2025-12-03T13:40:00.000Z', action: 'Ordem de serviço aberta', by: 'João Silva' },
    ],
  }
];

function convertInspectionStatus(status: string): 'pending' | 'progress' | 'completed' {
  if (status === 'em_andamento') return 'progress';
  if (status === 'concluida') return 'completed';
  return 'pending';
}

// ---------------------------------------------------------------------------
// Responsabilidade única: ler e unificar as Ordens de Serviço normais com as
// Ordens de Vistoria de Garantia, retornando uma lista única e ordenada, mais
// as contagens por status. Extraído de Maintenance.tsx para ser reutilizado
// pelo Dashboard sem duplicar a lógica de merge/conversão — se essa lógica
// mudar um dia, muda num lugar só.
// ---------------------------------------------------------------------------
export function useMaintenanceOrders() {
  const [maintenanceOrders, setMaintenanceOrders] = useLocalStorage<MaintenanceOrder[]>(
    'wave_maintenance_orders',
    DEFAULT_MAINTENANCE_ORDERS
  );
  const [inspectionOrders, setInspectionOrders] = useLocalStorage<InspectionOrder[]>(
    'wave_inspection_orders_v2',
    []
  );

  const convertedInspectionOrders: UnifiedMaintenanceOrder[] = inspectionOrders.map((inspection) => ({
    id: inspection.id,
    title: `Vistoria: ${inspection.system}`,
    priority: inspection.inspectionType === 'urgente' ? 'high' : 'medium',
    status: convertInspectionStatus(inspection.status),
    openedDate: new Date(inspection.createdAt).toLocaleDateString('pt-BR'),
    assignedTo: inspection.responsible,
    category: 'Vistoria de Garantia',
    hasDocument: false,
    isInspection: true,
    inspectionData: inspection,
  }));

  const allOrders: UnifiedMaintenanceOrder[] = [
    ...maintenanceOrders.map((o) => ({ ...o, isInspection: false })),
    ...convertedInspectionOrders,
  ].sort((a, b) => {
    const dateA = new Date(a.openedDate.split('/').reverse().join('-'));
    const dateB = new Date(b.openedDate.split('/').reverse().join('-'));
    return dateB.getTime() - dateA.getTime();
  });

  const abertas = allOrders.filter((o) => o.status === 'pending').length;
  const emAndamento = allOrders.filter((o) => o.status === 'progress').length;
  const concluidas = allOrders.filter((o) => o.status === 'completed').length;

  return {
    allOrders,
    maintenanceOrders,
    setMaintenanceOrders,
    inspectionOrders,
    setInspectionOrders,
    abertas,
    emAndamento,
    concluidas,
  };
}
