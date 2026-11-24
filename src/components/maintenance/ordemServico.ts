// ---------------------------------------------------------------------------
// src/components/maintenance/ordemServico.ts
//
// Lógica PURA das Ordens de Serviço (SÍN-012) — histórico de alterações,
// rótulos de status e formatações. Sem React/DOM: testável no Vitest e
// reutilizável pela UI e pelo hook `useMaintenanceOrders`.
//
// Contexto: o módulo de Manutenção é hoje client-side (localStorage). Este
// arquivo concentra a rastreabilidade das OS (quem/quando/o quê) para o modal
// de detalhes do Síndico. Quando houver backend de manutenção, a mesma forma
// de histórico é reaproveitada, trocando apenas a origem dos dados.
// ---------------------------------------------------------------------------

export type OrderStatus = 'pending' | 'progress' | 'completed';

/** Uma entrada do histórico de alterações de uma OS. */
export interface MaintenanceHistoryEntry {
  /** Quando a alteração ocorreu (ISO 8601, ou DD/MM/YYYY para eventos legados). */
  at: string;
  /** O que foi alterado (texto legível). */
  action: string;
  /** Quem realizou a alteração. */
  by: string;
}

export const STATUS_LABEL_OS: Record<OrderStatus, string> = {
  pending: 'Pendente',
  progress: 'Em Andamento',
  completed: 'Concluída',
};

/** Texto do evento de mudança de status (para o histórico). */
export function acaoMudancaStatus(novo: OrderStatus): string {
  return `Status alterado para "${STATUS_LABEL_OS[novo]}"`;
}

/** Evento de abertura da OS. */
export function eventoAbertura(by: string, at: string): MaintenanceHistoryEntry {
  return { at, action: 'Ordem de serviço aberta', by: by || '—' };
}

/**
 * Anexa uma entrada ao histórico de uma OS, sem mutar a entrada original.
 * Genérico para não acoplar ao tipo completo `MaintenanceOrder`.
 */
export function registrarAlteracao<T extends { history?: MaintenanceHistoryEntry[] }>(
  order: T,
  entry: MaintenanceHistoryEntry,
): T {
  return { ...order, history: [...(order.history ?? []), entry] };
}

/** Formata um custo em BRL; ausência vira uma indicação adequada (SÍN-012). */
export function formatCustoBRL(valor?: number | null): string {
  if (valor == null || Number.isNaN(valor)) return 'Não informado';
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formata a data/hora de um evento de histórico. Aceita ISO 8601 (formata como
 * DD/MM/YYYY HH:mm) ou valores legados já em texto (retornados como estão).
 */
export function formatDataHora(value: string): string {
  if (!value) return '—';
  if (value.includes('T')) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
  }
  return value;
}
