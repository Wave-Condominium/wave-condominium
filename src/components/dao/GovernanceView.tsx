'use client';

import { useEffect, useMemo, useState } from 'react';
import { Vote, Plus, TrendingUp, Archive } from 'lucide-react';
import { toast } from 'sonner';

import { useUser } from '../../contexts/UserContext';
import { isManager } from '../../lib/rbac';
import { type Proposta, type VoteChoice, isAprovada, isEmVotacao, isRejeitada } from './governanceCore';
import { type Filtro, parseFiltroParam } from './governanceFilter';
import { useGovernance } from './useGovernance';
import { GovernanceDashboard } from './GovernanceDashboard';
import { ProposalCard } from './ProposalCard';
import { FilaPrioridades } from './FilaPrioridades';
import { DeliberacoesAnteriores } from './DeliberacoesAnteriores';
import { CreatePropostaModal } from './CreatePropostaModal';

interface GovernanceViewProps {
  onViewProposal: (proposalId: string) => void;
}

/**
 * Tela unificada de Governanca (DAO). O mesmo componente serve morador e
 * gestor; as capacidades (criar proposta, encerrar votacao) sao liberadas por
 * RBAC. Substitui a divergencia entre Governance e GovernanceUser.
 */
export function GovernanceView({ onViewProposal }: GovernanceViewProps) {
  const { userProfile } = useUser();
  const canManage = isManager(userProfile.role);
  const userId = userProfile.id || 'morador-demo';

  const { propostas, loading, emVotacao, aprovadas, fila, config, stats, criarProposta, votar, encerrarVotacao, rejeitarProposta } = useGovernance();

  const [view, setView] = useState<'votacoes' | 'fila' | 'deliberacoes'>('votacoes');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [showCreate, setShowCreate] = useState(false);

  // MOR-020: quando a tela é aberta via Ação Rápida "Votações"
  // (`/dashboard/governance?filtro=aberta`), inicia direto nas votações em
  // andamento. Lido no mount a partir da URL (sem useSearchParams, para não
  // exigir Suspense no build); a navegação normal pelo menu mantém o padrão.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const alvo = parseFiltroParam(new URLSearchParams(window.location.search).get('filtro'));
    if (alvo) {
      setView('votacoes');
      setFiltro(alvo);
    }
  }, []);

  const lista = useMemo<Proposta[]>(() => {
    if (filtro === 'aberta') return emVotacao;
    if (filtro === 'aprovadas') return propostas.filter(isAprovada);
    if (filtro === 'rejeitadas') return propostas.filter((p) => p.status === 'rejeitada');
    return propostas;
  }, [filtro, propostas, emVotacao]);

  const handleVotar = async (id: string, escolha: VoteChoice) => {
    const r = await votar(id, userId, escolha);
    if (r === 'ja_votou') toast.error('Voce ja votou nesta proposta.');
    else if (r === 'encerrada') toast.error('A votacao desta proposta esta encerrada.');
    else toast.success('Voto registrado!', { description: 'Seu voto e unico e nao pode ser alterado.' });
  };

  const handleCriar = async (input: { titulo: string; descricao: string; categoria: Proposta['categoria'] }) => {
    setShowCreate(false);
    try {
      await criarProposta(input, userProfile.name || 'Morador');
    } catch (err) {
      console.error('Falha ao criar proposta', err);
      toast.error('Nao foi possivel publicar a proposta. Tente novamente.');
    }
  };

  // SÍN-005: rejeição com justificativa obrigatória (a proposta é preservada no
  // histórico). O ProposalCard só chama isto após validar o motivo localmente;
  // o servidor revalida. Retorna sucesso/erro para o card fechar/manter o form.
  const handleRejeitar = async (id: string, motivo: string): Promise<boolean> => {
    const res = await rejeitarProposta(id, motivo);
    if (res.ok) {
      toast.success('Proposta rejeitada.', { description: 'O registro foi mantido no histórico com o motivo da decisão.' });
      return true;
    }
    toast.error(res.error || 'Nao foi possivel rejeitar a proposta.');
    return false;
  };

  return (
    <div className="relative min-h-screen bg-brand-light p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="relative z-10 mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 mb-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand-teal">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
            Governança
          </span>
          <h1 className="mb-1 font-display font-normal text-brand-navy text-2xl sm:text-3xl">Governanca DAO</h1>
          <p className="text-sm text-brand-grey">Decisoes do condominio de forma transparente e participativa</p>
        </div>
        {/* Qualquer morador pode criar uma proposta (vai direto para votacao inicial). */}
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-deep to-brand-steel px-4 py-2.5 text-sm text-white shadow-lg transition-all hover:opacity-95"
        >
          <Plus className="h-4 w-4" /> Nova Proposta
        </button>
      </header>

      {/* Dashboard */}
      <div className="relative z-10 mb-6">
        <GovernanceDashboard stats={stats} />
      </div>

      {/* Tabs */}
      <nav className="relative z-10 mb-6 flex gap-2 rounded-2xl border border-wave-100 bg-white/80 p-2 shadow-lg backdrop-blur-sm" role="tablist">
        <TabBtn active={view === 'votacoes'} onClick={() => setView('votacoes')} icon={<Vote className="h-5 w-5" />} label={`Votacoes (${emVotacao.length})`} />
        <TabBtn active={view === 'fila'} onClick={() => setView('fila')} icon={<TrendingUp className="h-5 w-5" />} label={`Fila de Prioridades (${fila.length})`} />
        <TabBtn active={view === 'deliberacoes'} onClick={() => setView('deliberacoes')} icon={<Archive className="h-5 w-5" />} label="Deliberacoes Anteriores" />
      </nav>

      {view === 'fila' ? (
        <div className="relative z-10">
          <FilaPrioridades fila={fila} />
        </div>
      ) : view === 'deliberacoes' ? (
        <div className="relative z-10">
          <DeliberacoesAnteriores
            aprovadas={aprovadas}
            rejeitadas={propostas.filter(isRejeitada)}
            config={config}
            onVerDetalhes={onViewProposal}
          />
        </div>
      ) : (
        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Chip active={filtro === 'todas'} onClick={() => setFiltro('todas')} label={`Todas (${propostas.length})`} />
            <Chip active={filtro === 'aberta'} onClick={() => setFiltro('aberta')} label={`Em Votacao (${emVotacao.length})`} />
            <Chip active={filtro === 'aprovadas'} onClick={() => setFiltro('aprovadas')} label={`Aprovadas em Primeira Fase (${aprovadas.length})`} />
            <Chip active={filtro === 'rejeitadas'} onClick={() => setFiltro('rejeitadas')} label={`Rejeitadas (${propostas.filter((p) => p.status === 'rejeitada').length})`} />
          </div>

          {loading ? (
            <div className="rounded-2xl border border-wave-100 bg-white/70 px-6 py-14 text-center text-sm text-wave-500 backdrop-blur-sm">
              Carregando propostas...
            </div>
          ) : lista.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-wave-200 bg-white/70 px-6 py-14 text-center backdrop-blur-sm">
              <Vote className="mb-3 h-10 w-10 text-wave-300" aria-hidden="true" />
              <h3 className="mb-1 text-lg text-wave-800">Nenhuma proposta</h3>
              <p className="text-sm text-wave-500">
                {canManage ? 'Crie a primeira proposta para abrir a votacao.' : 'Aguarde o sindico publicar propostas para votacao.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {lista.map((p) => (
                <ProposalCard
                  key={p.id}
                  proposta={p}
                  userId={userId}
                  canManage={canManage}
                  onVotar={handleVotar}
                  onEncerrar={encerrarVotacao}
                  onRejeitar={handleRejeitar}
                  onVerDetalhes={onViewProposal}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreatePropostaModal onClose={() => setShowCreate(false)} onCreate={handleCriar} />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-all ${
        active ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow-lg' : 'bg-transparent text-wave-500 hover:bg-wave-50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition-all ${
        active ? 'bg-gradient-to-r from-brand-deep to-brand-steel text-white shadow' : 'bg-wave-50 text-wave-500 hover:bg-wave-100'
      }`}
    >
      {label}
    </button>
  );
}
