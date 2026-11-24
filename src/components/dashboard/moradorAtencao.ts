// ---------------------------------------------------------------------------
// src/components/dashboard/moradorAtencao.ts
//
// Lógica pura da seção "Atenção Necessária" do Morador (MOR-015).
//
// Problema resolvido: hoje o Morador via, no topo do dashboard, a "Atenção
// Necessária" do GESTOR — uma lista de alertas administrativos (garantias,
// fundo de reserva, etc.) que não são responsabilidade dele. Este módulo
// define o que, de fato, exige a atenção de um MORADOR, a partir dos dados
// que já pertencem a ele:
//
//   1. Comunicados do condomínio classificados como relevantes para todos os
//      moradores — aqui representados pela PRIORIDADE (urgente/alta). O modelo
//      de Aviso não possui destino por unidade; a prioridade é o sinal de
//      "isto exige atenção" já existente no domínio.
//   2. Solicitações da PRÓPRIA unidade que ainda estão em aberto/andamento —
//      itens que o morador está acompanhando.
//
// Comunicados de prioridade "normal" continuam visíveis na lista completa de
// "Comunicados do Condomínio"; apenas não sobem para "Atenção Necessária",
// evitando ruído (exatamente o que o card pede).
//
// Função pura, sem React/DOM — testável isoladamente.
// ---------------------------------------------------------------------------

import type { Aviso } from '../communication/types';
import type { SolicitacaoServico } from './moradorDashboardTypes';

export type AtencaoTipo = 'comunicado' | 'solicitacao';

/** Prioridade normalizada usada para ordenar e destacar itens de atenção. */
export type AtencaoNivel = 'urgente' | 'alta' | 'media';

export interface AtencaoItem {
  id: string;
  tipo: AtencaoTipo;
  titulo: string;
  /** Subtítulo curto (status/data) exibido abaixo do título. */
  descricao: string;
  /** ISO 8601 — usado apenas para ordenação (mais recente primeiro). */
  data: string;
  nivel: AtencaoNivel;
  /** Destino do "ver" — rota da seção de origem. */
  href: string;
}

const NIVEL_ORDER: Record<AtencaoNivel, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
};

/** Comunicados que sobem para "Atenção Necessária": só urgente/alta. */
function isComunicadoRelevante(aviso: Aviso): boolean {
  return aviso.prioridade === 'urgente' || aviso.prioridade === 'alta';
}

/** Solicitações que exigem acompanhamento: abertas ou em andamento. */
function isSolicitacaoAberta(s: SolicitacaoServico): boolean {
  return s.status === 'aberta' || s.status === 'em_andamento';
}

function comunicadoToItem(aviso: Aviso): AtencaoItem {
  return {
    id: `comunicado:${aviso.id}`,
    tipo: 'comunicado',
    titulo: aviso.titulo,
    descricao: aviso.prioridade === 'urgente' ? 'Comunicado urgente' : 'Comunicado importante',
    data: aviso.dataPublicacao,
    nivel: aviso.prioridade === 'urgente' ? 'urgente' : 'alta',
    href: '/dashboard/communication',
  };
}

function solicitacaoToItem(s: SolicitacaoServico): AtencaoItem {
  const emAndamento = s.status === 'em_andamento';
  return {
    id: `solicitacao:${s.id}`,
    tipo: 'solicitacao',
    titulo: s.tipo,
    descricao: emAndamento
      ? `Sua solicitação ${s.protocolo} está em andamento`
      : `Sua solicitação ${s.protocolo} está aberta`,
    data: s.atualizadoEm,
    // Aberta (aguardando) pesa mais que em andamento (já em tratamento).
    nivel: emAndamento ? 'media' : 'alta',
    href: '/dashboard/maintenance',
  };
}

export interface AtencaoInput {
  comunicados: Aviso[];
  solicitacoes: SolicitacaoServico[];
}

/**
 * Seleciona e ordena os itens que exigem a atenção do morador.
 * Ordenação: nível (urgente > alta > média), depois data (mais recente antes).
 * Não muta os arrays de entrada.
 */
export function selectAtencaoItems({ comunicados, solicitacoes }: AtencaoInput): AtencaoItem[] {
  const doComunicados = comunicados.filter(isComunicadoRelevante).map(comunicadoToItem);
  const doSolicitacoes = solicitacoes.filter(isSolicitacaoAberta).map(solicitacaoToItem);

  return [...doComunicados, ...doSolicitacoes].sort((a, b) => {
    const byNivel = NIVEL_ORDER[a.nivel] - NIVEL_ORDER[b.nivel];
    if (byNivel !== 0) return byNivel;
    // Data mais recente primeiro.
    if (a.data === b.data) return 0;
    return a.data < b.data ? 1 : -1;
  });
}
