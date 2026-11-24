'use client';

import { useState } from 'react';
import { FileText, ClipboardList, Wrench, Megaphone, Hash, Calendar, User, Eye, MapPin, Clock } from 'lucide-react';

import { useUser } from '../../contexts/UserContext';
import { formatData, formatDataEvento } from '../communication/avisoUtils';
import { PriorityBadge } from '../communication/PriorityBadge';
import { useMoradorDashboard } from './useMoradorDashboard';
import type { SolicitacaoServico } from './moradorDashboardTypes';
import { BlockCard, BlockEmpty } from './BlockCard';
import { OcorrenciaBadge } from './OcorrenciaBadge';
import { SolicitacaoDetailsModal } from './SolicitacaoDetailsModal';
import { MoradorAtencaoSection } from './MoradorAtencaoSection';
import { ProfissionaisSection } from '../staff/ProfissionaisSection';
import { FundoReservaCard } from '../fundoReserva/FundoReservaCard';
import { MinhasReceitasCard } from '../treasury/MinhasReceitasCard';

const MAX_ITENS = 4;

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Dashboard do Morador: painel personalizado com documentos, solicitacoes,
 * manutencoes da unidade e comunicados do condominio. Exibe apenas dados da
 * unidade do morador logado.
 */
export function MoradorDashboard() {
  const { userProfile } = useUser();
  const { documentos, solicitacoes, manutencoes, comunicados } = useMoradorDashboard(userProfile.unit);
  const [detalhe, setDetalhe] = useState<SolicitacaoServico | null>(null);

  return (
    <div className="mt-8 space-y-6 border-t border-wave-100 pt-8">
      <header>
        <h2 className="text-xl text-wave-800 sm:text-2xl">Documentos e Comunicados da Minha Unidade</h2>
        <p className="text-sm text-wave-500">
          {userProfile.unit ? `${userProfile.unit}: ` : ''}apenas o que pertence a sua unidade e os comunicados do condominio.
        </p>
      </header>

      {/* Atenção Necessária — o que exige a atenção do morador (MOR-015):
          comunicados urgentes/importantes + solicitações da unidade em aberto. */}
      <MoradorAtencaoSection comunicados={comunicados} solicitacoes={solicitacoes} />

      {/* MOR-023: Fundo de Reserva via Open Finance (somente leitura). */}
      <FundoReservaCard />

      {/* MOR-057: Receitas da própria cota (confirmação do PSP → contabilização). */}
      <MinhasReceitasCard />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Meus Documentos */}
        <BlockCard title="Meus Documentos" icon={<FileText className="h-5 w-5" />} verTodosHref="/dashboard/documents" count={documentos.length}>
          {documentos.length === 0 ? (
            <BlockEmpty texto="Nenhum documento vinculado a sua unidade." />
          ) : (
            <ul className="divide-y divide-wave-50">
              {documentos.slice(0, MAX_ITENS).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-wave-800">{d.titulo}</p>
                    <p className="text-xs text-wave-500">{d.tipo} • {formatData(d.data)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-wave-50 px-2.5 py-0.5 text-xs text-wave-600">{d.tipo}</span>
                </li>
              ))}
            </ul>
          )}
        </BlockCard>

        {/* Minhas Solicitacoes */}
        <BlockCard title="Minhas Solicitacoes" icon={<ClipboardList className="h-5 w-5" />} verTodosHref="/dashboard/maintenance" count={solicitacoes.length}>
          {solicitacoes.length === 0 ? (
            <BlockEmpty texto="Voce ainda nao abriu solicitacoes." />
          ) : (
            <ul className="space-y-3">
              {solicitacoes.slice(0, MAX_ITENS).map((s) => (
                <li key={s.id} className="rounded-xl border border-wave-100 p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-wave-500">
                      <Hash className="h-3.5 w-3.5" /> {s.protocolo}
                    </span>
                    <OcorrenciaBadge status={s.status} />
                  </div>
                  <p className="text-sm text-wave-800">{s.tipo}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-wave-500">
                      Aberta em {formatData(s.aberturaEm)} • atualizada em {formatData(s.atualizadoEm)}
                    </span>
                    <button
                      onClick={() => setDetalhe(s)}
                      className="inline-flex items-center gap-1 rounded-lg bg-wave-50 px-2.5 py-1 text-xs text-wave-600 transition-colors hover:bg-wave-100"
                    >
                      <Eye className="h-3.5 w-3.5" /> Ver detalhes
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </BlockCard>

        {/* Historico de Manutencoes da Unidade */}
        <BlockCard title="Historico de Manutencoes" icon={<Wrench className="h-5 w-5" />} verTodosHref="/dashboard/maintenance" count={manutencoes.length}>
          {manutencoes.length === 0 ? (
            <BlockEmpty texto="Nenhuma manutencao registrada na unidade." />
          ) : (
            <ul className="space-y-3">
              {manutencoes.slice(0, MAX_ITENS).map((m) => (
                <li key={m.id} className="rounded-xl border border-wave-100 p-3">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-wave-500">
                      <Calendar className="h-3.5 w-3.5" /> {formatData(m.data)}
                    </span>
                    <OcorrenciaBadge status={m.status} />
                  </div>
                  <p className="text-sm text-wave-800">{m.descricao}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-wave-500">
                    <span className="rounded-full bg-wave-50 px-2 py-0.5">{capitalize(m.categoria)}</span>
                    <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" /> {m.responsavel}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </BlockCard>

        {/* Comunicados do Condominio */}
        <BlockCard title="Comunicados do Condominio" icon={<Megaphone className="h-5 w-5" />} verTodosHref="/dashboard/communication" count={comunicados.length}>
          {comunicados.length === 0 ? (
            <BlockEmpty texto="Nenhum comunicado publicado." />
          ) : (
            <ul className="space-y-3">
              {comunicados.slice(0, MAX_ITENS).map((c) => (
                <li key={c.id} className="rounded-xl border border-wave-100 p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <PriorityBadge prioridade={c.prioridade} />
                    <span className="text-xs text-wave-500">{formatData(c.dataPublicacao)}</span>
                  </div>
                  <p className="text-sm text-wave-800">{c.titulo}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-wave-500">{c.conteudo}</p>
                  {c.dataEvento && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-purple-600">
                      <Clock className="h-3.5 w-3.5" />
                      Periodo previsto: {formatDataEvento(c.dataEvento)}
                      {c.horarioEvento ? ` as ${c.horarioEvento}` : ''}
                      {c.localEvento ? <span className="inline-flex items-center gap-1"> • <MapPin className="h-3 w-3" /> {c.localEvento}</span> : null}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </BlockCard>

        {/* Funcionários e Prestadores do condomínio (MOR-021) — somente leitura
            para o Morador; cadastro/gestão é exclusivo de Síndico/Administradora. */}
        <ProfissionaisSection />
      </div>

      {detalhe && <SolicitacaoDetailsModal solicitacao={detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
