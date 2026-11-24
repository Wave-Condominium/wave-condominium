// ---------------------------------------------------------------------------
// src/components/maintenance/buildingMaintenance.ts
//
// Fonte única de verdade para os dados e a lógica da "Manutenção Geral do
// Prédio" (garantias construtivas, conformidade legal e ordens de serviço
// do condomínio).
//
// Antes desta extração, os arrays de garantias/conformidade viviam DENTRO
// de ManagerMaintenanceView (Maintenance.tsx). Como o Morador agora também
// precisa VISUALIZAR essas informações (somente leitura), duplicar os dados
// em dois componentes abriria a porta para divergência silenciosa. Este
// módulo centraliza os dados e a lógica pura (sem JSX) para que gestor e
// morador consumam exatamente a mesma verdade.
//
// Observação de arquitetura: hoje esses dados são de demonstração
// (client-side). Quando existir backend, este módulo é o ponto natural para
// trocar as constantes por um data-source real (repository/service) sem
// tocar na camada de apresentação.
// ---------------------------------------------------------------------------

import type { UnifiedMaintenanceOrder } from '@/hooks/useMaintenanceOrders';

// ---------------------------------------------------------------------------
// Garantias construtivas do prédio
// ---------------------------------------------------------------------------

export type WarrantyHealth = 'critical' | 'warning' | 'good';

export interface BuildingWarranty {
  id: string;
  system: string;
  type: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  supplier: string;
}

// Limiares (em dias) para o estado de saúde de uma garantia. Nomeados para
// evitar números mágicos espalhados pela UI.
export const WARRANTY_CRITICAL_DAYS = 30;
export const WARRANTY_WARNING_DAYS = 90;

/**
 * Classifica a saúde de uma garantia pelo número de dias restantes.
 * Regra única compartilhada entre a visão do gestor e a do morador.
 */
export function getWarrantyHealth(daysRemaining: number): WarrantyHealth {
  if (daysRemaining <= WARRANTY_CRITICAL_DAYS) return 'critical';
  if (daysRemaining <= WARRANTY_WARNING_DAYS) return 'warning';
  return 'good';
}

export const BUILDING_WARRANTIES: BuildingWarranty[] = [
  {
    id: '1',
    system: "Bomba D'água Principal",
    type: 'Equipamento',
    startDate: '15/01/2023',
    endDate: '15/01/2026',
    daysRemaining: 28,
    supplier: 'Construtora XYZ',
  },
  {
    id: '2',
    system: 'Impermeabilização Piscina',
    type: 'Estrutural',
    startDate: '01/03/2023',
    endDate: '01/03/2028',
    daysRemaining: 754,
    supplier: 'Construtora XYZ',
  },
  {
    id: '3',
    system: 'Sistema de CFTV',
    type: 'Eletrônico',
    startDate: '10/06/2024',
    endDate: '10/06/2026',
    daysRemaining: 187,
    supplier: 'SecurityTech Ltda',
  },
];

// ---------------------------------------------------------------------------
// Conformidade legal do prédio
// ---------------------------------------------------------------------------

export type ComplianceHealth = 'valid' | 'warning' | 'expired';

export interface ComplianceItem {
  name: string;
  status: ComplianceHealth;
  validUntil: string;
  daysRemaining: number;
  authority: string;
}

export const BUILDING_COMPLIANCE: ComplianceItem[] = [
  {
    name: 'AVCB - Auto de Vistoria do Corpo de Bombeiros',
    status: 'valid',
    validUntil: '15/08/2026',
    daysRemaining: 253,
    authority: 'Corpo de Bombeiros SP',
  },
  {
    name: 'Seguro Predial Integral',
    status: 'valid',
    validUntil: '20/05/2026',
    daysRemaining: 166,
    authority: 'Porto Seguro',
  },
  {
    name: 'Laudo Técnico SPDA (Para-raios)',
    status: 'warning',
    validUntil: '10/02/2026',
    daysRemaining: 67,
    authority: 'Eng. Silva',
  },
];

// ---------------------------------------------------------------------------
// Seleção das ordens de serviço "do prédio" (áreas comuns / condomínio)
// ---------------------------------------------------------------------------

/**
 * Filtra as ordens de serviço que são de interesse coletivo do prédio,
 * removendo as solicitações privadas abertas por moradores (origin
 * 'morador').
 *
 * PRIVACIDADE / RBAC (regra crítica): um morador NÃO deve ver as
 * solicitações privadas de outros moradores/unidades. A visão "Manutenção
 * Geral do Prédio" mostra apenas manutenções coletivas — garantias,
 * vistorias e OS de áreas comuns abertas pela administração. As OS da
 * própria unidade do morador continuam na aba "Corretiva".
 *
 * Função pura para permitir teste sem DOM e reuso no dashboard.
 */
export function selectBuildingOrders(
  orders: UnifiedMaintenanceOrder[],
): UnifiedMaintenanceOrder[] {
  return orders.filter((order) => order.origin !== 'morador');
}
