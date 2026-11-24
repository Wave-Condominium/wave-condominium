// ---------------------------------------------------------------------------
// src/components/communication/communicationTab.ts
//
// Abas da tela de Comunicação + leitura do parâmetro de URL (MOR-024).
//
// A Ação Rápida "Reservas" do Dashboard leva a
// `/dashboard/communication?tab=reservas`; este helper converte o parâmetro na
// aba correspondente para abrir direto em Reservas.
//
// Função pura (sem React/DOM) — testável.
// ---------------------------------------------------------------------------

export type Tab = 'avisos' | 'reservas';

const TAB_ALIASES: Record<string, Tab> = {
  avisos: 'avisos',
  aviso: 'avisos',
  comunicados: 'avisos',
  reservas: 'reservas',
  reserva: 'reservas',
};

/** Converte o valor de `?tab=` numa aba válida; null quando ausente/desconhecido. */
export function parseCommTab(value?: string | null): Tab | null {
  if (!value) return null;
  return TAB_ALIASES[value.trim().toLowerCase()] ?? null;
}
