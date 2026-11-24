'use client';

// ---------------------------------------------------------------------------
// src/components/maintenance/BuildingMaintenanceSection.tsx
//
// "Manutenção Geral do Prédio" — visão SOMENTE LEITURA das manutenções
// coletivas do condomínio (garantias construtivas, conformidade legal e
// ordens de serviço de áreas comuns).
//
// Este componente é intencionalmente read-only: NÃO possui nenhum controle
// de criação, edição ou exclusão. A garantia de "somente leitura" para o
// Morador é estrutural — o componente não renderiza ações de mutação, e o
// roteamento por role (Maintenance.tsx) impede que o Morador acesse a visão
// do gestor. Isso atende à regra de RBAC do perfil Morador.
//
// Estados de interface tratados: empty state por seção. Os dados hoje são
// carregados de forma síncrona (client-side/demo); quando houver backend,
// o componente pai passa `isLoading`/`error` e este componente já expõe os
// respectivos estados.
// ---------------------------------------------------------------------------

import {
  Shield, ShieldCheck, CheckCircle, AlertCircle, Bell, Wrench,
  Calendar, Info, Lock,
} from 'lucide-react';

import {
  BUILDING_WARRANTIES,
  BUILDING_COMPLIANCE,
  getWarrantyHealth,
  selectBuildingOrders,
} from './buildingMaintenance';
import type { UnifiedMaintenanceOrder } from '@/hooks/useMaintenanceOrders';

interface BuildingMaintenanceSectionProps {
  /** Todas as OS conhecidas; o componente filtra internamente as coletivas. */
  orders: UnifiedMaintenanceOrder[];
  isLoading?: boolean;
  error?: string | null;
}

const ORDER_STATUS_CONFIG = {
  pending: { label: 'Aberta', color: 'text-orange-700', bg: 'bg-orange-100' },
  progress: { label: 'Em Andamento', color: 'text-blue-700', bg: 'bg-blue-100' },
  completed: { label: 'Concluída', color: 'text-emerald-700', bg: 'bg-emerald-100' },
} as const;

export function BuildingMaintenanceSection({
  orders,
  isLoading = false,
  error = null,
}: BuildingMaintenanceSectionProps) {
  if (isLoading) return <BuildingMaintenanceSkeleton />;

  if (error) {
    return (
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-red-200 p-8 text-center shadow-sm">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-wave-800 text-lg mb-1">Não foi possível carregar as manutenções do prédio</h3>
        <p className="text-wave-500 text-sm">{error}</p>
        <p className="text-wave-400 text-sm mt-1">Tente novamente em instantes ou fale com a administração.</p>
      </div>
    );
  }

  const buildingOrders = selectBuildingOrders(orders);

  return (
    <div className="space-y-8">
      {/* Aviso de escopo — deixa claro que é apenas para acompanhamento */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-blue-700 text-sm">
          Acompanhe aqui as manutenções, garantias e conformidades do prédio.
          Esta seção é apenas para consulta — a gestão é feita pela administração do condomínio.
        </p>
      </div>

      {/* ===================== Garantias Construtivas ===================== */}
      <section aria-labelledby="building-warranties-title">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-wave-500" aria-hidden="true" />
          <h2 id="building-warranties-title" className="text-wave-800 text-xl">Garantias Construtivas</h2>
        </div>

        {BUILDING_WARRANTIES.length === 0 ? (
          <EmptyState
            icon={<Shield className="w-10 h-10 text-wave-300 mx-auto mb-3" />}
            title="Nenhuma garantia registrada"
            description="As garantias construtivas do prédio aparecerão aqui quando cadastradas."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            {BUILDING_WARRANTIES.map((warranty) => {
              const health = getWarrantyHealth(warranty.daysRemaining);
              return (
                <article
                  key={warranty.id}
                  className={`bg-white/80 backdrop-blur-sm rounded-2xl border-2 p-5 sm:p-6 shadow-sm ${
                    health === 'critical' ? 'border-red-300'
                      : health === 'warning' ? 'border-orange-300'
                      : 'border-wave-100'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4 gap-2">
                    <h3 className="text-wave-800 flex-1">{warranty.system}</h3>
                    {health === 'critical' ? (
                      <AlertCircle className="w-5 h-5 text-red-500 shrink-0" aria-label="Garantia próxima do vencimento" />
                    ) : health === 'warning' ? (
                      <Bell className="w-5 h-5 text-orange-500 shrink-0" aria-label="Atenção ao vencimento" />
                    ) : (
                      <CheckCircle className="w-5 h-5 text-brand-teal shrink-0" aria-label="Garantia em dia" />
                    )}
                  </div>

                  <dl className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between gap-2">
                      <dt className="text-wave-500">Tipo:</dt>
                      <dd className="text-wave-800">{warranty.type}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-wave-500">Vencimento:</dt>
                      <dd className="text-wave-800">{warranty.endDate}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-wave-500">Fornecedor:</dt>
                      <dd className="text-wave-800 text-xs text-right">{warranty.supplier}</dd>
                    </div>
                  </dl>

                  <div className={`p-3 rounded-xl text-center ${
                    health === 'critical' ? 'bg-red-100 text-red-900'
                      : health === 'warning' ? 'bg-orange-100 text-orange-900'
                      : 'bg-brand-teal/15 text-brand-navy'
                  }`}>
                    <p className="text-2xl font-bold mb-1">{warranty.daysRemaining}</p>
                    <p className="text-sm">dias restantes</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================== Conformidade Legal ===================== */}
      <section aria-labelledby="building-compliance-title">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-5 h-5 text-wave-500" aria-hidden="true" />
          <h2 id="building-compliance-title" className="text-wave-800 text-xl">Conformidade Legal</h2>
        </div>

        {BUILDING_COMPLIANCE.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="w-10 h-10 text-wave-300 mx-auto mb-3" />}
            title="Nenhum documento de conformidade"
            description="Laudos, seguros e vistorias legais do prédio aparecerão aqui."
          />
        ) : (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-4 sm:p-6 shadow-sm">
            <ul className="space-y-4">
              {BUILDING_COMPLIANCE.map((item) => (
                <li key={item.name} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-wave-50 rounded-xl">
                  <div className="flex-1">
                    <h3 className="text-wave-800 mb-2">{item.name}</h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-wave-500">
                      <span>Válido até: {item.validUntil}</span>
                      <span className="hidden sm:inline">•</span>
                      <span>{item.authority}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className={`text-2xl font-bold mb-1 ${
                      item.status === 'expired' ? 'text-red-600'
                        : item.status === 'warning' ? 'text-orange-600'
                        : 'text-brand-teal'
                    }`}>
                      {item.daysRemaining}
                    </p>
                    <p className="text-sm text-wave-500">dias</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ===================== Ordens de Serviço do Prédio ===================== */}
      <section aria-labelledby="building-orders-title">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="w-5 h-5 text-wave-500" aria-hidden="true" />
          <h2 id="building-orders-title" className="text-wave-800 text-xl">Manutenções em Andamento</h2>
        </div>

        {buildingOrders.length === 0 ? (
          <EmptyState
            icon={<Wrench className="w-10 h-10 text-wave-300 mx-auto mb-3" />}
            title="Nenhuma manutenção coletiva no momento"
            description="Obras, reparos e vistorias das áreas comuns do prédio aparecerão aqui."
          />
        ) : (
          <ul className="space-y-3">
            {buildingOrders.map((order) => {
              const cfg = ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.pending;
              return (
                <li
                  key={order.id}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h3 className="text-wave-800 font-medium truncate">{order.title}</h3>
                        {order.isInspection && (
                          <span className="px-2.5 py-0.5 bg-wave-100 text-wave-700 rounded-full text-xs flex items-center gap-1">
                            <Shield className="w-3 h-3" aria-hidden="true" />
                            Vistoria
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-wave-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                          {order.openedDate}
                        </span>
                        <span aria-hidden="true">•</span>
                        <span>{order.category}</span>
                        <span className="text-wave-300" aria-hidden="true">|</span>
                        <span className="text-wave-400">{order.id}</span>
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-sm shrink-0 ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Rodapé — reforça o caráter somente-leitura para o morador */}
      <div className="bg-wave-50 border border-wave-100 rounded-xl p-4 flex items-start gap-3">
        <Lock className="w-5 h-5 text-wave-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-wave-600 text-sm">
          As manutenções do prédio são geridas pela administração do condomínio.
          Precisa de um reparo na sua unidade? Use a aba <strong>Corretiva</strong> para abrir uma solicitação.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes de apoio
// ---------------------------------------------------------------------------

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-10 text-center shadow-sm">
      {icon}
      <h3 className="text-wave-700 text-lg mb-1">{title}</h3>
      <p className="text-wave-400 text-sm">{description}</p>
    </div>
  );
}

function BuildingMaintenanceSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando manutenções do prédio…</span>
      <div className="h-16 bg-wave-100/70 rounded-xl animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-48 bg-wave-100/70 rounded-2xl animate-pulse" />
        ))}
      </div>
      <div className="h-40 bg-wave-100/70 rounded-2xl animate-pulse" />
    </div>
  );
}
