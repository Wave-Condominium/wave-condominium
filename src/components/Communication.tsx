'use client';

// ---------------------------------------------------------------------------
// src/components/Communication.tsx
//
// Orquestrador da aba Comunicacao. Responsabilidade unica: layout de pagina
// (cabecalho + abas) e alternancia entre os paineis de Avisos e Reservas.
//
// Toda a logica de dominio vive em src/components/communication/*:
//   - AvisosPanel  : comunicados oficiais (regras de prioridade + RBAC).
//   - ReservasPanel: reserva de espacos comuns.
//
// A aba Comunicacao e o canal oficial de informacoes relevantes do condominio.
// Publicacao de avisos e exclusiva do Sindico (RBAC); moradores visualizam.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { MessageSquare, Calendar } from 'lucide-react';

import { AvisosPanel } from './communication/AvisosPanel';
import { ReservasPanel } from './communication/ReservasPanel';
import { parseCommTab, type Tab } from './communication/communicationTab';

export function Communication() {
  const [activeTab, setActiveTab] = useState<Tab>('avisos');

  // MOR-024: ao chegar pela Ação Rápida "Reservas"
  // (`/dashboard/communication?tab=reservas`), abre direto na aba Reservas.
  // Lido no mount via window (sem useSearchParams, para não exigir Suspense).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const alvo = parseCommTab(new URLSearchParams(window.location.search).get('tab'));
    if (alvo) setActiveTab(alvo);
  }, []);

  return (
    <div className="relative min-h-screen bg-brand-light p-4 sm:p-6 lg:p-8">
      <header className="relative z-10 mb-6">
        <h1 className="mb-1 text-2xl text-wave-800 sm:text-3xl">Comunicacao</h1>
        <p className="text-sm text-wave-500 sm:text-base">
          Canal oficial de avisos, eventos e reservas do condominio
        </p>
      </header>

      <nav
        className="relative z-10 mb-6 flex gap-2 rounded-2xl border border-wave-100 bg-white/80 p-2 shadow-lg backdrop-blur-sm"
        role="tablist"
        aria-label="Secoes da comunicacao"
      >
        <TabButton
          active={activeTab === 'avisos'}
          onClick={() => setActiveTab('avisos')}
          icon={<MessageSquare className="h-5 w-5" />}
          label="Avisos"
        />
        <TabButton
          active={activeTab === 'reservas'}
          onClick={() => setActiveTab('reservas')}
          icon={<Calendar className="h-5 w-5" />}
          label="Reservas"
        />
      </nav>

      {activeTab === 'avisos' ? <AvisosPanel /> : <ReservasPanel />}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-all sm:text-base ${
        active
          ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg'
          : 'bg-transparent text-wave-500 hover:bg-wave-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
