'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Shield, ExternalLink, Search, CheckCircle, XCircle, Clock,
  DollarSign, FileText, Vote, User, AlertCircle, Receipt, Filter,
  AlertTriangle, Wrench, ChevronRight, ShieldCheck, ShieldAlert, Loader2, X, Home, Building2,
} from 'lucide-react';
import { useBlockchainAutoRegistry } from '@/hooks/useBlockchainAutoRegistry';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useUser } from '@/contexts/UserContext';
import { verifyDocumentOnChain } from '@/app/actions/blockchain';

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

type FilterType = 'all' | 'financial' | 'proposal' | 'vote' | 'document' | 'unit' | 'approval' | 'onboarding';
type MoradorTab = 'pagamentos' | 'votacoes' | 'documentos';

const TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  financial: { label: 'Pagamento', icon: DollarSign, color: 'text-brand-teal', bg: 'bg-brand-teal/15' },
  proposal:  { label: 'Proposta',  icon: Vote,       color: 'text-purple-700', bg: 'bg-purple-100'  },
  vote:      { label: 'Voto',      icon: Vote,       color: 'text-blue-700',   bg: 'bg-blue-100'    },
  document:  { label: 'Documento', icon: FileText,   color: 'text-amber-700',  bg: 'bg-amber-100'   },
  user:      { label: 'Usuário',   icon: User,       color: 'text-gray-700',   bg: 'bg-gray-100'    },
  unit:      { label: 'Unidade',   icon: Home,       color: 'text-wave-600',   bg: 'bg-wave-100'    },
  approval:  { label: 'Aprovação', icon: CheckCircle, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  onboarding: { label: 'Onboarding', icon: Building2, color: 'text-brand-deep', bg: 'bg-wave-100'   },
};

const MORADOR_TABS: { key: MoradorTab; label: string; icon: React.ElementType }[] = [
  { key: 'pagamentos', label: 'Pagamentos', icon: Receipt },
  { key: 'votacoes',   label: 'Votações',   icon: Vote },
  { key: 'documentos', label: 'Documentos', icon: FileText },
];

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function BlockchainRegistry() {
  const { records } = useBlockchainAutoRegistry();
  const { userProfile } = useUser();
  const isMorador = userProfile.role === 'Morador';

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-brand-light min-h-screen relative">
      {isMorador ? <MoradorAuditView /> : <AdminAuditView records={records} />}
    </div>
  );
}

// ===========================================================================
// MORADOR — Auditoria da própria unidade
// ===========================================================================

function MoradorAuditView() {
  const { userProfile } = useUser();
  const [activeTab, setActiveTab] = useState<MoradorTab>('pagamentos');
  const [search, setSearch] = useState('');

  // Fontes de dados — filtradas pela unidade do morador
  const userUnit = userProfile.unit;

  const [boletos] = useLocalStorage<any[]>('wave_boletos', []);
  const [proposals] = useLocalStorage<any[]>('wave_proposals_v2', []);
  const [proposalsLegacy] = useLocalStorage<any[]>('wave_proposals', []);
  const [documents] = useLocalStorage<any[]>('wave_documents_stellar', []);
  const [maintenanceRequests] = useLocalStorage<any[]>('wave_maintenance_requests', []);
  const { records: blockchainRecords } = useBlockchainAutoRegistry();

  // ── Pagamentos: boletos da unidade do morador ──
  const meusPagamentos = useMemo(() => {
    return boletos
      .filter((b: any) => b.unitNumber === userUnit || b.unit === userUnit)
      .sort((a: any, b: any) => {
        const da = a.paidAt || a.createdAt || a.dueDate || '';
        const db = b.paidAt || b.createdAt || b.dueDate || '';
        return new Date(db).getTime() - new Date(da).getTime();
      });
  }, [boletos, userUnit]);

  // ── Votações: propostas onde o morador participou ──
  const minhasVotacoes = useMemo(() => {
    const allProposals = [...(proposals || []), ...(proposalsLegacy || [])];
    // Deduplica por id
    const seen = new Set<string>();
    const unique = allProposals.filter((p: any) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Filtra propostas nas quais o morador votou (por nome ou id)
    return unique
      .filter((p: any) => {
        if (!p.votos) return false;
        const voters = Object.keys(p.votos);
        return voters.some(v =>
          v === userProfile.id ||
          v === userProfile.name ||
          v.toLowerCase() === userProfile.name?.toLowerCase()
        );
      })
      .sort((a: any, b: any) =>
        new Date(b.criadaEm || b.createdAt || '').getTime() -
        new Date(a.criadaEm || a.createdAt || '').getTime()
      );
  }, [proposals, proposalsLegacy, userProfile.id, userProfile.name]);

  // ── Documentos: registros blockchain de documentos + documentos reais ──
  const meusDocumentos = useMemo(() => {
    // Documentos registrados na blockchain que pertencem à unidade
    const blockchainDocs = blockchainRecords
      .filter((r: any) => r.type === 'document')
      .map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        date: r.timestamp,
        status: r.status,
        category: r.metadata?.category || 'Geral',
        source: 'blockchain' as const,
        txHash: r.txHash || '',
        contentHash: r.metadata?.contentHash || '',
      }));

    // Documentos do storage
    const storageDocs = (documents || []).map((d: any) => ({
      id: d.id || d.hash || Math.random().toString(),
      title: d.fileName || d.name || d.title || 'Documento',
      description: d.description || `Categoria: ${d.category || 'Geral'}`,
      date: d.uploadedAt || d.createdAt || d.timestamp || '',
      status: 'available',
      category: d.category || 'Geral',
      source: 'storage' as const,
      txHash: d.stellarTxHash || d.blockchainHash || '',
      contentHash: d.contentHash || '',
    }));

    return [...blockchainDocs, ...storageDocs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [blockchainRecords, documents]);

  // ── Pendências: itens que exigem ação do morador ──
  const pendencias = useMemo(() => {
    const items: { type: string; icon: React.ElementType; label: string; description: string; date: string; status: string; color: string; bg: string }[] = [];

    // Boletos pendentes ou vencidos da unidade
    meusPagamentos
      .filter((b: any) => {
        const isPaid = b.status === 'pago' || b.status === 'blockchain_registered' || b.paidAt;
        return !isPaid && (b.status === 'pendente' || b.status === 'vencido' || !b.status);
      })
      .forEach((b: any) => {
        const isOverdue = b.status === 'vencido' || (b.dueDate && new Date(b.dueDate) < new Date());
        items.push({
          type: 'pagamento',
          icon: DollarSign,
          label: 'Pagamento pendente',
          description: b.description || b.referenceMonth || 'Boleto condominial',
          date: b.dueDate || b.createdAt || '',
          status: isOverdue ? 'Vencido' : 'Pendente',
          color: isOverdue ? 'text-red-600' : 'text-amber-600',
          bg: isOverdue ? 'bg-red-100' : 'bg-amber-100',
        });
      });

    // Votações abertas nas quais o morador ainda não votou
    const allProposals = [...(proposals || []), ...(proposalsLegacy || [])];
    const seenIds = new Set<string>();
    allProposals.forEach((p: any) => {
      if (seenIds.has(p.id)) return;
      seenIds.add(p.id);
      if (p.status !== 'votacao_aberta') return;
      // Verifica se já votou
      const votos = p.votos || {};
      const alreadyVoted = Object.keys(votos).some(v =>
        v === userProfile.id ||
        v === userProfile.name ||
        v.toLowerCase() === userProfile.name?.toLowerCase()
      );
      if (alreadyVoted) return;
      items.push({
        type: 'votacao',
        icon: Vote,
        label: 'Votação aberta',
        description: p.titulo || p.title || 'Proposta em votação',
        date: p.criadaEm || p.createdAt || '',
        status: 'Aguardando voto',
        color: 'text-blue-600',
        bg: 'bg-blue-100',
      });
    });

    // Solicitações de manutenção pendentes da unidade
    (maintenanceRequests || [])
      .filter((r: any) => {
        const matchUnit = r.unit === userUnit || r.unitNumber === userUnit;
        const isPending = r.status === 'pendente' || r.status === 'aberta' || r.status === 'em_analise';
        return matchUnit && isPending;
      })
      .forEach((r: any) => {
        items.push({
          type: 'solicitacao',
          icon: Wrench,
          label: 'Solicitação em andamento',
          description: r.title || r.description || 'Manutenção solicitada',
          date: r.createdAt || r.requestedAt || '',
          status: r.status === 'em_analise' ? 'Em análise' : 'Pendente',
          color: 'text-purple-600',
          bg: 'bg-purple-100',
        });
      });

    return items;
  }, [meusPagamentos, proposals, proposalsLegacy, maintenanceRequests, userProfile.id, userProfile.name, userUnit]);

  // Contadores para badges nas tabs
  const counts = {
    pagamentos: meusPagamentos.length,
    votacoes: minhasVotacoes.length,
    documentos: meusDocumentos.length,
  };

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-1">Auditoria</h1>
        <p className="text-wave-500 text-sm">
          Histórico de ações relacionadas à sua unidade{userUnit ? ` (${userUnit})` : ''}
        </p>
      </div>

      {/* Stats resumo */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pagamentos', value: counts.pagamentos, icon: DollarSign, bg: 'bg-brand-teal/15', color: 'text-brand-teal' },
          { label: 'Votações',   value: counts.votacoes,   icon: Vote,       bg: 'bg-blue-100',      color: 'text-blue-600' },
          { label: 'Documentos', value: counts.documentos, icon: FileText,   bg: 'bg-amber-100',     color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-4 sm:p-5 shadow-lg">
            <div className={`inline-flex p-2 rounded-lg ${s.bg} mb-2`}>
              <s.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.color}`} />
            </div>
            <p className="text-xl sm:text-2xl font-semibold text-wave-800">{s.value}</p>
            <p className="text-wave-500 text-xs sm:text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pendências */}
      {pendencias.length > 0 ? (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-amber-200 shadow-lg mb-6 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-amber-100 bg-amber-50/50">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="text-wave-800 text-sm font-semibold">Pendências</h2>
            <span className="ml-auto px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
              {pendencias.length}
            </span>
          </div>
          <div className="divide-y divide-wave-100">
            {pendencias.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={`${item.type}-${idx}`} className="px-5 py-3.5 hover:bg-wave-50/50 transition-colors flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg ${item.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-wave-800 text-sm font-medium">{item.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-wave-400 text-xs">{item.label}</span>
                      {item.date && (
                        <span className="text-wave-400 text-xs">
                          · {new Date(item.date).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.bg} ${item.color} shrink-0`}>
                    {item.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-brand-teal/30 shadow-lg mb-6 px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-teal/15 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-4 h-4 text-brand-teal" />
          </div>
          <div>
            <p className="text-wave-800 text-sm font-medium">Nenhuma pendência no momento</p>
            <p className="text-wave-400 text-xs">Você está em dia com suas obrigações condominiais.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {MORADOR_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-wave-700 text-white shadow'
                  : 'bg-white border border-wave-200 text-wave-500 hover:bg-wave-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {counts[tab.key] > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                  isActive ? 'bg-white/20 text-white' : 'bg-wave-100 text-wave-600'
                }`}>
                  {counts[tab.key]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wave-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar no histórico..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-wave-200 rounded-xl text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-wave-300"
        />
      </div>

      {/* Conteúdo da tab ativa */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 shadow-lg relative z-10">
        {activeTab === 'pagamentos' && (
          <PagamentosTab boletos={meusPagamentos} search={search} />
        )}
        {activeTab === 'votacoes' && (
          <VotacoesTab propostas={minhasVotacoes} search={search} userName={userProfile.name} userId={userProfile.id} />
        )}
        {activeTab === 'documentos' && (
          <DocumentosTab documentos={meusDocumentos} search={search} />
        )}
      </div>

      {/* Como funciona a verificação */}
      <div className="bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-5 sm:p-6 border border-wave-200 shadow-lg mt-6">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-wave-300 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-wave-800 text-sm font-semibold mb-2">Como funciona a verificação</h3>
            <p className="text-wave-600 text-sm leading-relaxed mb-3">
              Cada documento e pagamento registrado na plataforma recebe uma assinatura digital
              única que garante sua autenticidade. Você pode verificar a qualquer momento se
              um documento é autêntico e se não foi alterado desde o registro original.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-wave-500">
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Segurança</p>
                <p>Registro permanente e imutável</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Transparência</p>
                <p>Verificação independente da plataforma</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Integridade</p>
                <p>Detecção de qualquer alteração</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab: Pagamentos
// ---------------------------------------------------------------------------

function PagamentosTab({ boletos, search }: { boletos: any[]; search: string }) {
  const filtered = boletos.filter((b: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (b.description || '').toLowerCase().includes(s) ||
      (b.referenceMonth || '').toLowerCase().includes(s) ||
      (b.unitNumber || '').toLowerCase().includes(s) ||
      String(b.amount || '').includes(s)
    );
  });

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={DollarSign}
        title="Nenhum pagamento encontrado"
        description={search ? 'Tente outro termo de busca.' : 'Seus pagamentos aparecerão aqui conforme forem registrados.'}
      />
    );
  }

  return (
    <div className="divide-y divide-wave-100">
      {filtered.map((boleto: any, idx: number) => {
        const isPaid = boleto.status === 'pago' || boleto.status === 'blockchain_registered' || boleto.paidAt;
        const statusLabel = isPaid ? 'Pago' : boleto.status === 'vencido' ? 'Vencido' : boleto.status === 'pendente' ? 'Pendente' : (boleto.status || 'Registrado');

        return (
          <div key={boleto.id || idx} className="p-4 sm:p-5 hover:bg-wave-50/50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-brand-teal/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <DollarSign className="w-4 h-4 text-brand-teal" />
                </div>
                <div className="min-w-0">
                  <p className="text-wave-800 text-sm font-medium">
                    {boleto.description || boleto.referenceMonth || 'Pagamento condominial'}
                  </p>
                  <p className="text-wave-500 text-xs mt-0.5">
                    {boleto.referenceMonth && `Competência: ${boleto.referenceMonth}`}
                    {boleto.amount != null && ` · R$ ${Number(boleto.amount).toFixed(2).replace('.', ',')}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-wave-400 text-xs">
                    {boleto.paidAt && (
                      <span>Pago em: {new Date(boleto.paidAt).toLocaleDateString('pt-BR')}</span>
                    )}
                    {boleto.dueDate && !boleto.paidAt && (
                      <span>Vencimento: {new Date(boleto.dueDate).toLocaleDateString('pt-BR')}</span>
                    )}
                    {boleto.blockchainHash && (
                      <span className="text-wave-300">
                        Código de verificação: <span className="font-mono">{boleto.blockchainHash.slice(0, 8)}…</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <StatusPill
                label={statusLabel}
                variant={isPaid ? 'success' : boleto.status === 'vencido' ? 'danger' : 'warning'}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Votações
// ---------------------------------------------------------------------------

function VotacoesTab({ propostas, search, userName, userId }: {
  propostas: any[];
  search: string;
  userName: string;
  userId: string;
}) {
  const filtered = propostas.filter((p: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (p.titulo || p.title || '').toLowerCase().includes(s) ||
      (p.descricao || p.description || '').toLowerCase().includes(s) ||
      (p.categoria || p.category || '').toLowerCase().includes(s)
    );
  });

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={Vote}
        title="Nenhuma votação encontrada"
        description={search ? 'Tente outro termo de busca.' : 'Suas participações em votações aparecerão aqui.'}
      />
    );
  }

  const VOTE_LABEL: Record<string, { text: string; color: string; bg: string }> = {
    aprovo:    { text: 'Aprovei',   color: 'text-brand-teal', bg: 'bg-brand-teal/15' },
    reprovo:   { text: 'Reprovei',  color: 'text-red-600',    bg: 'bg-red-100' },
    abstencao: { text: 'Abstenção', color: 'text-wave-500',   bg: 'bg-wave-100' },
  };

  return (
    <div className="divide-y divide-wave-100">
      {filtered.map((p: any, idx: number) => {
        // Descobre o voto do morador
        const votos = p.votos || {};
        const myVoteKey = Object.keys(votos).find(v =>
          v === userId || v === userName || v.toLowerCase() === userName?.toLowerCase()
        );
        const myVote = myVoteKey ? votos[myVoteKey] : null;
        const voteInfo = myVote ? VOTE_LABEL[myVote] : null;

        const STATUS_MAP: Record<string, string> = {
          votacao_aberta: 'Em votação',
          votacao_encerrada: 'Encerrada',
          aprovada_comunidade: 'Aprovada',
          rejeitada: 'Rejeitada',
          fila_prioridades: 'Na fila',
          em_execucao: 'Em execução',
          concluida: 'Concluída',
        };

        return (
          <div key={p.id || idx} className="p-4 sm:p-5 hover:bg-wave-50/50 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Vote className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-wave-800 text-sm font-medium">{p.titulo || p.title}</p>
                  <p className="text-wave-500 text-xs mt-0.5 line-clamp-2">
                    {p.descricao || p.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {voteInfo && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${voteInfo.bg} ${voteInfo.color}`}>
                        <CheckCircle className="w-3 h-3" />
                        {voteInfo.text}
                      </span>
                    )}
                    <span className="text-wave-400 text-xs">
                      {p.criadaEm || p.createdAt
                        ? new Date(p.criadaEm || p.createdAt).toLocaleDateString('pt-BR')
                        : ''}
                    </span>
                    {p.categoria && (
                      <span className="text-wave-400 text-xs">· {p.categoria}</span>
                    )}
                  </div>
                </div>
              </div>
              <StatusPill
                label={STATUS_MAP[p.status] || p.status || '—'}
                variant={
                  p.status === 'aprovada_comunidade' || p.status === 'concluida' ? 'success'
                  : p.status === 'rejeitada' ? 'danger'
                  : 'neutral'
                }
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Documentos (com verificação de autenticidade)
// ---------------------------------------------------------------------------

interface VerificationResult {
  verified: boolean;
  reason: string;
  ledger?: number;
  createdAt?: string;
}

function DocumentosTab({ documentos, search }: { documentos: any[]; search: string }) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<{
    doc: any;
    result: VerificationResult | null;
    error: string | null;
    loading: boolean;
  } | null>(null);

  const handleVerify = useCallback(async (doc: any) => {
    const txHash = doc.txHash;
    const contentHash = doc.contentHash;

    if (!txHash) {
      setVerificationResult({
        doc,
        result: null,
        error: 'Este documento ainda não possui registro de verificação.',
        loading: false,
      });
      return;
    }

    setVerifyingId(doc.id);
    setVerificationResult({ doc, result: null, error: null, loading: true });

    try {
      const result = await verifyDocumentOnChain(txHash, contentHash || '');
      setVerificationResult({
        doc,
        result: {
          verified: result.verified,
          reason: result.reason,
          ledger: result.ledger,
          createdAt: result.createdAt,
        },
        error: null,
        loading: false,
      });
    } catch {
      setVerificationResult({
        doc,
        result: null,
        error: 'Não foi possível realizar a verificação no momento. Tente novamente mais tarde.',
        loading: false,
      });
    } finally {
      setVerifyingId(null);
    }
  }, []);

  const closeVerification = useCallback(() => {
    setVerificationResult(null);
  }, []);

  const filtered = documentos.filter((d: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (d.title || '').toLowerCase().includes(s) ||
      (d.description || '').toLowerCase().includes(s) ||
      (d.category || '').toLowerCase().includes(s)
    );
  });

  if (filtered.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nenhum documento encontrado"
        description={search ? 'Tente outro termo de busca.' : 'Documentos relacionados à sua unidade aparecerão aqui.'}
      />
    );
  }

  return (
    <>
      <div className="divide-y divide-wave-100">
        {filtered.map((doc: any, idx: number) => {
          const canVerify = !!doc.txHash;
          const isVerifying = verifyingId === doc.id;

          return (
            <div key={doc.id || idx} className="p-4 sm:p-5 hover:bg-wave-50/50 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-wave-800 text-sm font-medium">{doc.title}</p>
                    <p className="text-wave-500 text-xs mt-0.5">{doc.description}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-wave-400 text-xs">
                      {doc.date && (
                        <span>{new Date(doc.date).toLocaleDateString('pt-BR')}</span>
                      )}
                      {doc.category && <span>· {doc.category}</span>}
                      {canVerify && (
                        <span className="text-brand-teal font-medium">Registro disponível</span>
                      )}
                    </div>
                    {/* Botão de verificação */}
                    <button
                      onClick={() => handleVerify(doc)}
                      disabled={isVerifying}
                      className={`mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        canVerify
                          ? 'bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 border border-brand-teal/30'
                          : 'bg-wave-50 text-wave-400 hover:bg-wave-100 border border-wave-200'
                      } disabled:opacity-50`}
                    >
                      {isVerifying ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Verificando...
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verificar autenticidade
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <StatusPill
                  label={doc.status === 'confirmed' ? 'Confirmado' : doc.status === 'available' ? 'Disponível' : doc.status || '—'}
                  variant={doc.status === 'confirmed' || doc.status === 'available' ? 'success' : 'neutral'}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de resultado da verificação */}
      {verificationResult && (
        <VerificationModal
          doc={verificationResult.doc}
          result={verificationResult.result}
          error={verificationResult.error}
          loading={verificationResult.loading}
          onClose={closeVerification}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Modal: Resultado da Verificação de Autenticidade
// ---------------------------------------------------------------------------

function VerificationModal({ doc, result, error, loading, onClose }: {
  doc: any;
  result: VerificationResult | null;
  error: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-brand-navy/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da verificação de autenticidade"
    >
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-wave-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-wave-100">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-wave-500" />
            <h3 className="text-wave-800 font-semibold text-sm">Verificação de Autenticidade</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-wave-100 flex items-center justify-center transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4 text-wave-400" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-5">
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="w-10 h-10 text-brand-teal animate-spin mx-auto mb-4" />
              <p className="text-wave-700 text-sm font-medium">Verificando autenticidade...</p>
              <p className="text-wave-400 text-xs mt-1">Consultando registro de integridade do documento.</p>
            </div>
          ) : error ? (
            /* Erro na verificação */
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-7 h-7 text-amber-600" />
              </div>
              <p className="text-wave-800 font-semibold mb-1">Verificação indisponível</p>
              <p className="text-wave-500 text-sm leading-relaxed">{error}</p>
            </div>
          ) : result?.verified ? (
            /* Documento autenticado */
            <div>
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-7 h-7 text-brand-teal" />
                </div>
                <p className="text-brand-teal font-semibold text-lg">Documento autenticado</p>
                <p className="text-wave-500 text-sm mt-1 leading-relaxed">
                  A autenticidade e a integridade deste documento foram verificadas com sucesso.
                </p>
              </div>

              <div className="bg-wave-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Documento</p>
                  <p className="text-wave-800 text-sm mt-0.5">{doc.title}</p>
                </div>
                {doc.date && (
                  <div>
                    <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Data do documento</p>
                    <p className="text-wave-800 text-sm mt-0.5">{new Date(doc.date).toLocaleDateString('pt-BR')}</p>
                  </div>
                )}
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Data da verificação</p>
                  <p className="text-wave-800 text-sm mt-0.5">{new Date().toLocaleString('pt-BR')}</p>
                </div>
                {result.createdAt && (
                  <div>
                    <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Data do registro</p>
                    <p className="text-wave-800 text-sm mt-0.5">{new Date(result.createdAt).toLocaleString('pt-BR')}</p>
                  </div>
                )}
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Status</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-teal/15 text-brand-teal rounded-full text-xs font-medium mt-0.5">
                    <CheckCircle className="w-3 h-3" />
                    Documento não alterado
                  </span>
                </div>
                {doc.txHash && (
                  <div>
                    <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Código de verificação</p>
                    <p className="text-wave-600 text-xs font-mono mt-0.5 break-all leading-relaxed">
                      {doc.txHash.slice(0, 16)}...{doc.txHash.slice(-8)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Documento não verificado */
            <div>
              <div className="text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert className="w-7 h-7 text-red-500" />
                </div>
                <p className="text-red-600 font-semibold text-lg">Não foi possível confirmar a autenticidade</p>
                <p className="text-wave-500 text-sm mt-1 leading-relaxed">
                  {result?.reason?.includes('nao encontrada') || result?.reason?.includes('NAO corresponde')
                    ? 'O conteúdo deste documento pode ter sido alterado após o registro original, ou o registro não foi localizado. Recomendamos entrar em contato com a administração do condomínio para esclarecimentos.'
                    : 'A verificação não pôde ser concluída. Recomendamos entrar em contato com a administração do condomínio.'}
                </p>
              </div>

              <div className="bg-red-50 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Documento</p>
                  <p className="text-wave-800 text-sm mt-0.5">{doc.title}</p>
                </div>
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Data da verificação</p>
                  <p className="text-wave-800 text-sm mt-0.5">{new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div>
                  <p className="text-wave-400 text-xs font-medium uppercase tracking-wide">Status</p>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium mt-0.5">
                    <XCircle className="w-3 h-3" />
                    Autenticidade não confirmada
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-wave-100 bg-wave-50/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-wave-700 text-white rounded-xl hover:bg-wave-800 transition-colors text-sm font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// SÍNDICO / ADMIN — Auditoria completa (mantida, renomeada)
// ===========================================================================

function AdminAuditView({ records }: { records: any[] }) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  const [boletos] = useLocalStorage<any[]>('wave_boletos', []);
  const boletosRegistrados = boletos.filter((b: any) =>
    b.blockchainHash && b.status === 'blockchain_registered'
  );

  const filtered = records.filter((r: any) => {
    const matchType   = filter === 'all' || r.type === filter;
    const matchSearch = !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.txHash.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase());
    return matchType && matchSearch;
  });

  const confirmed = records.filter((r: any) => r.status === 'confirmed').length;
  const pending   = records.filter((r: any) => r.status === 'pending').length;

  return (
    <>
      {/* Header */}
      <div className="mb-6 relative z-10">
        <h1 className="font-display text-brand-navy text-2xl sm:text-3xl mb-1">Auditoria</h1>
        <p className="text-wave-500 text-sm">
          Trilha de auditoria completa com todos os eventos registrados
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
        {[
          { label: 'Total de registros',     value: records.length,             icon: Shield,      bg: 'bg-wave-100',      color: 'text-wave-600' },
          { label: 'Confirmados',             value: confirmed,                  icon: CheckCircle, bg: 'bg-brand-teal/15', color: 'text-brand-teal' },
          { label: 'Pendentes',               value: pending,                    icon: Clock,       bg: 'bg-amber-100',     color: 'text-amber-600' },
          { label: 'Pagamentos verificados',  value: boletosRegistrados.length,  icon: DollarSign,  bg: 'bg-blue-100',      color: 'text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-5 shadow-lg">
            <div className={`inline-flex p-2 rounded-lg ${s.bg} mb-3`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <p className="text-2xl font-semibold text-wave-800">{s.value}</p>
            <p className="text-wave-500 text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pagamentos registrados */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 mb-8 shadow-lg relative z-10">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-brand-teal" />
            <h2 className="text-wave-800 text-lg font-medium">Pagamentos Condominiais</h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-brand-teal/10 border border-brand-teal/30 rounded-full">
            <div className="w-2 h-2 bg-brand-teal/100 rounded-full animate-pulse" />
            <span className="text-brand-teal text-xs font-medium">Verificável publicamente</span>
          </div>
        </div>

        {boletosRegistrados.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-10 h-10 text-wave-300 mx-auto mb-3" />
            <p className="text-wave-500 text-sm">Nenhum pagamento registrado ainda.</p>
            <p className="text-wave-400 text-xs mt-1">
              Após o pagamento de um boleto, o comprovante aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {boletosRegistrados.map((boleto: any) => {
              const explorerUrl = boleto.stellarExplorerUrl ??
                (boleto.blockchainHash && !boleto.blockchainHash.startsWith('0x') && boleto.blockchainHash.length === 64
                  ? `https://stellar.expert/explorer/testnet/tx/${boleto.blockchainHash}`
                  : null);

              return (
                <div key={boleto.id} className="border border-brand-teal/30 bg-brand-teal/10 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-wave-800 font-medium">
                        Unidade {boleto.unitNumber}
                        {boleto.unitOwner && <span className="text-wave-500 font-normal"> · {boleto.unitOwner}</span>}
                      </p>
                      <p className="text-wave-500 text-sm mt-0.5">
                        {boleto.description || boleto.referenceMonth}
                        {boleto.amount && ` · R$ ${boleto.amount.toFixed(2).replace('.', ',')}`}
                      </p>
                      {boleto.paidAt && (
                        <p className="text-wave-400 text-xs mt-0.5">
                          Pago em: {new Date(boleto.paidAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                    </div>
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-brand-teal/15 text-brand-teal rounded-full text-xs font-medium shrink-0">
                      <CheckCircle className="w-3 h-3" /> Verificado
                    </span>
                  </div>

                  <div className="bg-white rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-wave-500 text-xs font-medium uppercase tracking-wide">
                        Registro verificado
                      </p>
                      <span className="text-xs text-brand-teal font-medium">Comprovação de integridade</span>
                    </div>
                    <div>
                      <p className="text-wave-400 text-xs mb-1">Código de verificação</p>
                      <p className="text-wave-700 text-xs font-mono break-all leading-relaxed">
                        {boleto.blockchainHash}
                      </p>
                    </div>
                    {boleto.blockchainRegisteredAt && (
                      <p className="text-wave-400 text-xs">
                        Registrado em: {new Date(boleto.blockchainRegisteredAt).toLocaleString('pt-BR')}
                      </p>
                    )}
                    {explorerUrl ? (
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 bg-brand-teal hover:opacity-90 text-white rounded-lg transition-colors text-xs font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Verificar registro
                      </a>
                    ) : (
                      <div className="mt-2 flex items-center gap-2 w-full py-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        <p className="text-amber-700 text-xs">Registro guardado com segurança · verificação externa indisponível no momento</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Relatório de auditoria (visível ao síndico) */}
      {boletosRegistrados.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 mb-8 shadow-lg relative z-10 overflow-x-auto">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-wave-500" />
            <h2 className="text-wave-800 text-lg font-medium">Relatório de Auditoria</h2>
            <span className="ml-auto text-xs text-wave-400 italic">Visível apenas para síndico/admin</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wave-100">
                {['Unidade', 'Competência', 'Valor R$', 'Método', 'Código de verificação', 'Status'].map(h => (
                  <th key={h} className="text-left py-2 px-3 text-wave-500 text-xs font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {boletosRegistrados.map((b: any) => {
                const explorerUrl = b.stellarExplorerUrl ??
                  (b.blockchainHash?.length === 64 ? `https://stellar.expert/explorer/testnet/tx/${b.blockchainHash}` : null);
                return (
                  <tr key={b.id} className="border-b border-wave-50 hover:bg-wave-50/50">
                    <td className="py-2 px-3 text-wave-700">Apto {b.unitNumber}</td>
                    <td className="py-2 px-3 text-wave-600 text-xs">{b.referenceMonth || b.description}</td>
                    <td className="py-2 px-3 text-wave-700 font-medium">R$ {b.amount?.toFixed(2).replace('.', ',')}</td>
                    <td className="py-2 px-3 text-wave-500 text-xs">Pix/Cartão/Boleto</td>
                    <td className="py-2 px-3">
                      {b.blockchainHash ? (
                        <span className="font-mono text-xs text-wave-500">
                          {b.blockchainHash.slice(0, 8)}...{b.blockchainHash.slice(-6)}
                        </span>
                      ) : <span className="text-wave-300 text-xs">—</span>}
                    </td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-brand-teal/15 text-brand-teal rounded-full text-xs font-medium">
                          Confirmado
                        </span>
                        {explorerUrl && (
                          <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
                            className="text-wave-400 hover:text-wave-600">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Trilha de auditoria completa */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-wave-100 p-6 mb-6 shadow-lg relative z-10">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-5 h-5 text-wave-500" />
          <h2 className="text-wave-800 text-lg font-medium">Trilha de Auditoria Completa</h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-wave-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por título ou código..."
              className="w-full pl-9 pr-4 py-2 bg-wave-50 border border-wave-200 rounded-xl text-wave-800 text-sm focus:outline-none focus:ring-2 focus:ring-wave-300"
            />
          </div>
          {(['all', 'financial', 'proposal', 'vote', 'document', 'unit'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                filter === f ? 'bg-wave-700 text-white shadow' : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
              }`}
            >
              {f === 'all' ? 'Todos' :
               f === 'financial' ? 'Pagamentos' :
               f === 'proposal' ? 'Propostas' :
               f === 'vote' ? 'Votos' :
               f === 'document' ? 'Documentos' : 'Unidades'}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-10">
            <Shield className="w-12 h-12 text-wave-300 mx-auto mb-3" />
            <p className="text-wave-500">Nenhum registro encontrado.</p>
            <p className="text-wave-400 text-xs mt-1">
              Os registros aparecem aqui conforme as ações são realizadas na plataforma.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((record: any) => {
              const cfg = TYPE_CONFIG[record.type] ?? TYPE_CONFIG['document'];
              const Icon = cfg.icon;
              return (
                <div key={record.id} className="bg-wave-50 rounded-xl p-4 border border-wave-100 hover:border-wave-200 transition-all">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <p className="text-wave-800 text-sm font-medium">{record.title}</p>
                    </div>
                    <RecordStatusBadge status={record.status} />
                  </div>

                  <p className="text-wave-500 text-xs mb-2">{record.description}</p>

                  {record.txHash && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-wave-400 text-xs font-mono truncate flex-1">
                        {record.txHash.slice(0, 20)}...{record.txHash.slice(-8)}
                      </p>
                      {record.explorerUrl && record.status === 'confirmed' && (
                        <a
                          href={record.explorerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-wave-500 hover:text-wave-700 underline shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Verificar
                        </a>
                      )}
                    </div>
                  )}

                  <p className="text-wave-400 text-xs mt-2">
                    {new Date(record.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-gradient-to-r from-brand-deep to-brand-steel rounded-2xl p-6 border border-wave-200 shadow-lg relative z-10">
        <div className="flex items-start gap-3">
          <Shield className="w-6 h-6 text-wave-300 shrink-0 mt-1" />
          <div>
            <h3 className="text-wave-800 mb-2">Como funciona a verificação</h3>
            <p className="text-wave-600 text-sm mb-3">
              Cada pagamento e documento recebe um código de verificação único no momento do
              registro. A qualquer momento é possível comprovar que a informação é autêntica e
              não foi alterada desde então — de forma independente da plataforma.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-wave-500">
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Segurança</p>
                <p>Registro permanente e imutável</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Transparência</p>
                <p>Verificação independente da plataforma</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-wave-300 font-medium mb-1">Integridade</p>
                <p>Detecção de qualquer alteração</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// Componentes auxiliares reutilizáveis
// ===========================================================================

function StatusPill({ label, variant }: {
  label: string;
  variant: 'success' | 'warning' | 'danger' | 'neutral';
}) {
  const styles = {
    success: 'bg-brand-teal/15 text-brand-teal',
    warning: 'bg-amber-100 text-amber-700',
    danger:  'bg-red-100 text-red-700',
    neutral: 'bg-wave-100 text-wave-600',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium shrink-0 ${styles[variant]}`}>
      {variant === 'success' && <CheckCircle className="w-3 h-3" />}
      {variant === 'warning' && <Clock className="w-3 h-3" />}
      {variant === 'danger' && <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function EmptyState({ icon: Icon, title, description }: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center py-12 px-4">
      <Icon className="w-12 h-12 text-wave-300 mx-auto mb-3" />
      <p className="text-wave-500 text-sm font-medium">{title}</p>
      <p className="text-wave-400 text-xs mt-1">{description}</p>
    </div>
  );
}

function RecordStatusBadge({ status }: { status: string }) {
  if (status === 'confirmed') return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-brand-teal/15 text-brand-teal rounded-full text-xs shrink-0">
      <CheckCircle className="w-3 h-3" /> Confirmado
    </span>
  );
  if (status === 'pending') return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs shrink-0">
      <Clock className="w-3 h-3" /> Pendente
    </span>
  );
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs shrink-0">
      <XCircle className="w-3 h-3" /> Falhou
    </span>
  );
}
