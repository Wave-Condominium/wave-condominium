'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  AlertTriangle,
  Clock,
  Wrench,
  DollarSign,
  FileText,
  Vote,
  Calendar,
  Zap,
  Bell,
  MapPin,
  CheckCheck
} from 'lucide-react';

import Link from 'next/link';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';
import { useMaintenanceOrders } from '@/hooks/useMaintenanceOrders';
import { useNotifications } from '@/hooks/useNotifications';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useUser } from '@/contexts/UserContext';
import { isManager } from '@/lib/rbac';
import { usePendencias } from '@/contexts/PendenciasContext';
import { listPropostasAction } from '@/app/actions/governanca';
import { PENDENCIA_TIPO_LABEL } from '@/components/approvals/pendencias';
import { MoradorDashboard } from '@/components/dashboard/MoradorDashboard';
import {
  CONDOMINIUM_SETTINGS_KEY,
  DEFAULT_CONDOMINIUM_SETTINGS,
  type CondominiumSettings,
} from '@/lib/condominiumSettings';

interface AvisoEvento {
  id: string;
  tipo: string;
  titulo: string;
  dataEvento?: string;
  horarioEvento?: string;
  localEvento?: string;
}

const MONTH_ABBR_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function parseEventDate(dataEvento: string): { day: string; monthLabel: string } {
  const [, month, day] = dataEvento.split('-');
  const monthIdx = parseInt(month, 10) - 1;
  return { day, monthLabel: MONTH_ABBR_PT[monthIdx] ?? month };
}

function getTodayLocalISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

function formatRelativeTime(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora';
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h atrás`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d atrás`;
}

function formatCurrentDateBR(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function GestorDashboard() {
  const router = useRouter();
  const { userProfile } = useUser();
  const [currentDateLabel, setCurrentDateLabel] = useState('');
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  useEffect(() => {
    setCurrentDateLabel(formatCurrentDateBR(new Date()));
  }, []);

  const { saldoAtual, fundoReserva, percentualAdimplencia, percentualInadimplencia, loading: financeiroLoading } = useFinancialSummary();
  // RBAC (regra permanente do projeto): Adimplência/Inadimplência são dados
  // financeiros sensíveis, restritos a Síndico e Admin — Morador não vê.
  // LIMITAÇÃO: sem backend real, o valor é calculado no cliente independente
  // do perfil; isto apenas oculta na interface. Bloqueio real do dado só
  // existe quando a API validar o perfil no servidor (ver rbac.ts).
  const canViewFinancialCompliance = isManager(userProfile.role);
  const { abertas, emAndamento, concluidas } = useMaintenanceOrders();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  // SÍN-004: Atenção Necessária e métricas de governança usam DADOS REAIS do
  // banco (escopados ao condomínio ativo), não mais mocks. Aprovações pendentes
  // vêm do contexto (Central de Aprovações); propostas em votação, da governança.
  const { pendencias, count: aprovacoesPendentes } = usePendencias();
  const [propostasAbertas, setPropostasAbertas] = useState(0);
  useEffect(() => {
    if (!isManager(userProfile.role)) { setPropostasAbertas(0); return; }
    let alive = true;
    listPropostasAction()
      .then((r) => { if (alive) setPropostasAbertas(r.propostas.filter((p) => p.status === 'votacao_aberta').length); })
      .catch(() => { /* silencioso: o card mostra 0 */ });
    return () => { alive = false; };
  }, [userProfile.role]);

  const [avisos] = useLocalStorage<AvisoEvento[]>('wave_avisos', []);
  const [condominiumSettings] = useLocalStorage<CondominiumSettings>(
    CONDOMINIUM_SETTINGS_KEY,
    DEFAULT_CONDOMINIUM_SETTINGS
  );
  const todayISO = getTodayLocalISO();
  const upcomingEvents = avisos
    .filter((a) => a.tipo === 'evento' && a.dataEvento && a.dataEvento >= todayISO)
    .sort((a, b) => (a.dataEvento! < b.dataEvento! ? -1 : a.dataEvento! > b.dataEvento! ? 1 : 0))
    .slice(0, 5);

  function handleNotificationClick(notification: { id: string; actionUrl?: string }) {
    markAsRead(notification.id);
    setIsNotifOpen(false);
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }

  return (
    <div className="space-y-8 relative">
      
      
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-20">
        <div>
          <span className="inline-flex items-center gap-2 mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
            Painel de gestão
          </span>
          <h1 className="font-display font-normal text-2xl sm:text-3xl text-brand-navy">Visão Geral</h1>
          <p className="text-brand-grey">Bem-vindo ao painel de gestão do seu condomínio</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative">
            <button
              onClick={() => setIsNotifOpen((v) => !v)}
              className="p-2 bg-white rounded-xl shadow-sm border border-wave-100 text-wave-500 hover:bg-wave-50 transition-colors relative"
              aria-label="Notificações"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-[10px] rounded-full border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsNotifOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-2xl border border-wave-100 shadow-xl z-50">
                  <div className="p-4 border-b border-wave-100 flex items-center justify-between sticky top-0 bg-white">
                    <h3 className="text-wave-800 font-medium text-sm">Notificações</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => markAllAsRead()}
                        className="text-wave-500 text-xs hover:text-wave-700 flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Marcar todas como lidas
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-6 text-center text-wave-400 text-sm">Nenhuma notificação</p>
                  ) : (
                    <div className="divide-y divide-wave-50">
                      {notifications.slice(0, 10).map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left p-4 hover:bg-wave-50 transition-colors flex gap-3 ${!n.read ? 'bg-wave-50/60' : ''}`}
                        >
                          {!n.read && <span className="w-2 h-2 mt-1.5 rounded-full bg-wave-500 flex-shrink-0" />}
                          <div className={!n.read ? '' : 'ml-5'}>
                            <p className="text-wave-800 text-sm font-medium">{n.title}</p>
                            <p className="text-wave-500 text-xs mt-0.5 line-clamp-2">{n.message}</p>
                            <p className="text-wave-400 text-xs mt-1">{formatRelativeTime(n.timestamp)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <button className="px-4 py-2 bg-white rounded-xl shadow-sm border border-wave-100 text-wave-500 hover:bg-wave-50 transition-colors flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{currentDateLabel}</span>
          </button>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

        <Link
          href="/dashboard/treasury"
          className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-wave-100 shadow-sm hover:shadow-md hover:border-wave-300 transition-all group block cursor-pointer"
        >
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-xl bg-brand-teal/15 text-brand-teal group-hover:scale-110 transition-transform">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <h3 className="text-wave-800 font-medium mb-3">Saúde Financeira</h3>
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-wave-500">Saldo</span>
              <span className="font-mono text-brand-ink font-medium">{financeiroLoading ? '—' : formatBRL(saldoAtual)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-wave-500">Fundo de Reserva</span>
              <span className="font-mono text-brand-ink font-medium">{financeiroLoading ? '—' : formatBRL(fundoReserva)}</span>
            </div>
            {canViewFinancialCompliance && (
              <>
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-wave-50">
                  <span className="text-wave-500">Adimplência</span>
                  <span className="font-mono text-brand-teal font-medium">{financeiroLoading ? '—' : `${percentualAdimplencia}%`}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-wave-500">Inadimplência</span>
                  <span className="font-mono text-orange-600 font-medium">{financeiroLoading ? '—' : `${percentualInadimplencia}%`}</span>
                </div>
              </>
            )}
          </div>
        </Link>

        <Link
          href="/dashboard/maintenance"
          className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-wave-100 shadow-sm hover:shadow-md hover:border-wave-300 transition-all group block cursor-pointer"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-xl ${abertas > 0 ? 'bg-orange-100 text-orange-600' : 'bg-brand-teal/15 text-brand-teal'} group-hover:scale-110 transition-transform`}>
              <Wrench className="w-6 h-6" />
            </div>
            <span className={`font-mono text-2xl font-bold ${abertas > 0 ? 'text-orange-600' : 'text-brand-teal'}`}>
              {abertas}
            </span>
          </div>
          <h3 className="text-wave-800 font-medium mb-1">Manutenção</h3>
          <p className="text-wave-500 text-sm mb-2">Ordens de serviço em aberto</p>
          <p className="text-wave-400 text-xs">{emAndamento} em andamento · {concluidas} concluídas</p>
        </Link>

        {/* SÍN-004: métricas REAIS do banco (não mais valores fictícios de
            conformidade/participação). Contagens escopadas ao condomínio ativo. */}
        {[
          {
            title: 'Aprovações pendentes',
            value: String(aprovacoesPendentes),
            icon: CheckCheck,
            description: 'Aguardando sua decisão',
            detail: aprovacoesPendentes > 0 ? 'Abrir Central de Aprovações' : 'Nada pendente',
            href: '/dashboard/approvals',
          },
          {
            title: 'Propostas em votação',
            value: String(propostasAbertas),
            icon: Vote,
            description: 'Governança',
            detail: propostasAbertas > 0 ? 'Ver votações abertas' : 'Nenhuma votação aberta',
            href: '/dashboard/governance',
          },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <Link
              key={metric.title}
              href={metric.href}
              className="bg-white/80 backdrop-blur-sm p-6 rounded-2xl border border-wave-100 shadow-sm hover:shadow-md hover:border-wave-300 transition-all group block"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 rounded-xl bg-brand-teal/15 text-brand-teal group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6" />
                </div>
                <span className="font-mono text-2xl font-bold text-brand-teal">
                  {metric.value}
                </span>
              </div>
              <h3 className="text-wave-800 font-medium mb-1">{metric.title}</h3>
              <p className="text-wave-500 text-sm mb-2">{metric.description}</p>
              <p className="text-wave-400 text-xs">{metric.detail}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {/* RBAC / MOR-015: esta "Atenção Necessária" é a lista de alertas de
              GESTÃO (garantias, fundo de reserva, etc.). É pertinente apenas a
              Síndico/Administrador — o Morador tem a sua própria "Atenção
              Necessária" (relevante à unidade dele) no MoradorDashboard. */}
          {isManager(userProfile.role) && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <h2 className="font-display font-normal text-xl text-brand-navy">Atenção Necessária</h2>
            </div>
            
            {/* SÍN-004: itens REAIS que aguardam decisão (Central de Aprovações),
                escopados ao condomínio ativo. Sem estado vazio fictício. */}
            <div className="space-y-4">
              {pendencias.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCheck className="w-10 h-10 text-brand-teal mx-auto mb-3" />
                  <p className="text-wave-700 font-medium">Nenhuma pendência no momento.</p>
                  <p className="text-wave-500 text-sm mt-1 mb-4">
                    Aprovações de propostas, reservas, despesas e reuniões aparecem aqui assim que surgirem.
                  </p>
                  <Link
                    href="/dashboard/approvals"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-wave-600 text-sm rounded-lg border border-wave-200 hover:bg-wave-50 hover:border-wave-300 transition-all shadow-sm"
                  >
                    Abrir Central de Aprovações
                  </Link>
                </div>
              ) : (
                pendencias.slice(0, 5).map((p) => (
                  <div key={`${p.tipo}:${p.id}`} className="flex items-center justify-between gap-3 p-4 bg-wave-50/50 rounded-xl border border-wave-100 hover:border-wave-300 transition-colors">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-wave-800 font-medium truncate">{p.titulo}</h3>
                        <p className="text-wave-500 text-sm truncate">
                          {PENDENCIA_TIPO_LABEL[p.tipo]} · {p.solicitante}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/dashboard/approvals"
                      className="px-4 py-2 bg-white text-wave-500 text-sm rounded-lg border border-wave-200 hover:bg-wave-50 hover:border-wave-300 transition-all shadow-sm shrink-0"
                    >
                      Decidir
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
          )}

        </div>

        <div className="space-y-8">
          <div className="bg-gradient-to-br from-brand-deep to-brand-steel rounded-2xl p-6 text-white shadow-lg">
            <h2 className="font-display text-lg font-medium mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Ações Rápidas
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/dashboard/governance?filtro=aberta" className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-center backdrop-blur-sm">
                <Vote className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs">Votações</span>
              </Link>
              <Link href="/dashboard/maintenance" className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-center backdrop-blur-sm">
                <Wrench className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs">Abrir Chamado</span>
              </Link>
              <Link href="/dashboard/documents" className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-center backdrop-blur-sm">
                <FileText className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs">Documentos</span>
              </Link>
              {/* MOR-024: atalho para a reserva de espaços comuns (aba Reservas em Comunicação) */}
              <Link href="/dashboard/communication?tab=reservas" className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors text-center backdrop-blur-sm">
                <Calendar className="w-6 h-6 mx-auto mb-2" />
                <span className="text-xs">Reservas</span>
              </Link>
              {condominiumSettings.whatsappGroupLink && (
                <a
                  href={condominiumSettings.whatsappGroupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="col-span-2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors backdrop-blur-sm flex items-center justify-center gap-2"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
                  </svg>
                  <span className="text-xs">Grupo do Condomínio</span>
                </a>
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-sm p-6">
            <h2 className="font-display font-normal text-xl text-brand-navy mb-6">Próximos Eventos</h2>
            {upcomingEvents.length === 0 ? (
              <p className="text-wave-400 text-sm italic text-center py-6">Nenhum evento agendado</p>
            ) : (
              <div className="space-y-1">
                {upcomingEvents.map((event) => {
                  const { day, monthLabel } = parseEventDate(event.dataEvento!);
                  return (
                    <div key={event.id} className="flex gap-3 items-start py-2.5 border-b border-wave-50 last:border-0">
                      <div className="flex-shrink-0 w-11 text-center">
                        <span className="block text-[10px] text-wave-500 uppercase font-medium">{monthLabel}</span>
                        <span className="block text-xl text-wave-800 font-medium leading-tight">{day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-wave-800 font-medium text-sm mb-1 truncate">{event.titulo}</p>
                        {event.horarioEvento || event.localEvento ? (
                          <p className="text-wave-500 text-xs flex items-center gap-3 flex-wrap">
                            {event.horarioEvento && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {event.horarioEvento}
                              </span>
                            )}
                            {event.localEvento && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" />
                                {event.localEvento}
                              </span>
                            )}
                          </p>
                        ) : (
                          <p className="text-wave-400 text-xs italic">Sem horário informado</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { userProfile } = useUser();
  // A Visao Geral (funcionalidade existente) e PRESERVADA para todos os perfis.
  // Para o morador, acrescentamos ABAIXO as secoes da sua unidade + comunicados,
  // sem remover nem alterar nada do dashboard atual.
  return (
    <>
      <GestorDashboard />
      {!isManager(userProfile.role) && <MoradorDashboard />}
    </>
  );
}
