import { describe, it, expect } from 'vitest';

import {
  getWarrantyHealth,
  selectBuildingOrders,
  WARRANTY_CRITICAL_DAYS,
  WARRANTY_WARNING_DAYS,
} from './buildingMaintenance';
import type { UnifiedMaintenanceOrder } from '@/hooks/useMaintenanceOrders';

// Helper para montar uma OS mínima válida sem repetir campos em cada teste.
function makeOrder(
  overrides: Partial<UnifiedMaintenanceOrder> = {},
): UnifiedMaintenanceOrder {
  return {
    id: 'OS-000',
    title: 'OS de teste',
    priority: 'medium',
    status: 'pending',
    openedDate: '01/01/2026',
    assignedTo: null,
    category: 'Geral',
    hasDocument: false,
    isInspection: false,
    ...overrides,
  };
}

describe('getWarrantyHealth', () => {
  it('classifica como crítica quando faltam poucos dias (<= limiar crítico)', () => {
    expect(getWarrantyHealth(0)).toBe('critical');
    expect(getWarrantyHealth(WARRANTY_CRITICAL_DAYS)).toBe('critical');
  });

  it('classifica como atenção entre o limiar crítico e o de atenção', () => {
    expect(getWarrantyHealth(WARRANTY_CRITICAL_DAYS + 1)).toBe('warning');
    expect(getWarrantyHealth(WARRANTY_WARNING_DAYS)).toBe('warning');
  });

  it('classifica como saudável acima do limiar de atenção', () => {
    expect(getWarrantyHealth(WARRANTY_WARNING_DAYS + 1)).toBe('good');
    expect(getWarrantyHealth(365)).toBe('good');
  });
});

describe('selectBuildingOrders (privacidade)', () => {
  it('inclui OS do condomínio / áreas comuns', () => {
    const orders = [
      makeOrder({ id: 'OS-1', origin: 'condominio' }),
      makeOrder({ id: 'OS-2' }), // sem origin explícita = coletiva
    ];
    const result = selectBuildingOrders(orders);
    expect(result.map((o) => o.id)).toEqual(['OS-1', 'OS-2']);
  });

  it('NÃO expõe solicitações privadas de moradores (outras unidades)', () => {
    const orders = [
      makeOrder({ id: 'OS-COND', origin: 'condominio' }),
      makeOrder({ id: 'OS-MORADOR', origin: 'morador', unit: '504' }),
    ];
    const result = selectBuildingOrders(orders);
    expect(result.map((o) => o.id)).toEqual(['OS-COND']);
    expect(result.some((o) => o.origin === 'morador')).toBe(false);
  });

  it('preserva vistorias de garantia (isInspection) como manutenção do prédio', () => {
    const orders = [
      makeOrder({ id: 'INSP-1', isInspection: true, category: 'Vistoria de Garantia' }),
      makeOrder({ id: 'OS-MORADOR', origin: 'morador' }),
    ];
    const result = selectBuildingOrders(orders);
    expect(result.map((o) => o.id)).toEqual(['INSP-1']);
  });

  it('não muta o array de entrada', () => {
    const orders = [makeOrder({ id: 'OS-1', origin: 'morador' })];
    const snapshot = [...orders];
    selectBuildingOrders(orders);
    expect(orders).toEqual(snapshot);
  });
});
