"use server";

// ---------------------------------------------------------------------------
// src/app/actions/aprovacoes.ts
//
// Server Actions da Central de Aprovações Pendentes (SÍN-026).
//
// AGREGADOR: reúne, num formato único (`Pendencia`), as solicitações que
// aguardam a decisão do Síndico, lendo os módulos que já são fonte de verdade
// no banco. Nesta fase: Reservas (status pendente) e Propostas (aprovadas pela
// comunidade, aguardando homologação). Novas fontes (financeiro, reuniões,
// manutenção...) se plugam aqui sem mudar a UI.
//
// DECISÃO: `decidirPendenciaAction` NÃO reimplementa regras — despacha para as
// ações já existentes de cada módulo (aprovar/rejeitar/homologar), que revalidam
// permissão (requireManager) e escopo por condomínio no servidor. Assim a
// Central concentra a decisão sem duplicar lógica nem quebrar os fluxos atuais.
// ---------------------------------------------------------------------------

import { requireManager } from "@/server/auth/guard";
import { listReservasAction, aprovarReservaAction, rejeitarReservaAction } from "@/app/actions/reservas";
import { listPropostasAction, homologarPropostaAction, rejeitarPropostaAction } from "@/app/actions/governanca";
import { listDespesasAction, aprovarDespesaAction, reprovarDespesaAction } from "@/app/actions/despesas";
import {
  listReunioesAction,
  aprovarAtaAction,
  rejeitarAtaAction,
  publicarReuniaoAction,
  descartarReuniaoAction,
} from "@/app/actions/reunioes";
import type { Reuniao } from "@/components/meetings/reunioes";
import {
  listSolicitacoesAguardandoAction,
  aprovarSolicitacaoAction,
  recusarSolicitacaoAction,
} from "@/app/actions/manutencao";
import { PRIORIDADE_LABEL, type Solicitacao } from "@/components/maintenance/solicitacoes";
import {
  ordenarPendencias,
  type Pendencia,
  type PendenciaTipo,
  type Decisao,
} from "@/components/approvals/pendencias";
import type { Reserva, EspacoId } from "@/components/communication/reservas/types";
import type { Proposta } from "@/components/dao/governanceCore";
import { formatBRL, type Despesa, CATEGORIA_DESPESA_LABEL } from "@/components/treasury/despesas";

// Rótulos de espaço (decoupled da constante .tsx da UI, que carrega ícones).
const ESPACO_LABEL: Record<EspacoId, string> = {
  salao: "Salão de Festas",
  churrasqueira: "Churrasqueira",
  quadra: "Quadra Poliesportiva",
  gourmet: "Espaço Gourmet",
};

const CATEGORIA_LABEL: Record<string, string> = {
  obras: "Obras", seguranca: "Segurança", financeiro: "Financeiro", eventos: "Eventos",
  melhorias: "Melhorias", sustentabilidade: "Sustentabilidade", outros: "Outros",
};

// SLA (dias) para a decisão do Síndico numa proposta aprovada pela comunidade.
const SLA_DECISAO_PROPOSTA_DIAS = 7;

function formatDataBR(iso: string): string {
  // aceita 'YYYY-MM-DD' ou ISO completo
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

// --- Mapeamento de cada fonte -> Pendencia -----------------------------------

function mapReserva(r: Reserva): Pendencia {
  // Prazo natural: o próprio evento — decidir depois dele é inócuo.
  const prazo = `${r.data}T${r.horarioInicio || "00:00"}:00`;
  return {
    tipo: "RESERVA",
    id: r.id,
    titulo: `${ESPACO_LABEL[r.espaco]} · ${formatDataBR(r.data)}`,
    solicitante: r.solicitante,
    dataEntrada: r.criadaEm,
    prazo,
    detalhes: [
      { label: "Espaço", valor: ESPACO_LABEL[r.espaco] },
      { label: "Data", valor: formatDataBR(r.data) },
      { label: "Horário", valor: `${r.horarioInicio} às ${r.horarioFim}` },
      ...(r.observacoes ? [{ label: "Observações", valor: r.observacoes }] : []),
    ],
    rejeicaoMotivoObrigatorio: false,
  };
}

function mapProposta(p: Proposta): Pendencia {
  const entrada = p.aprovadaEm ?? p.criadaEm;
  const prazo = new Date(new Date(entrada).getTime() + SLA_DECISAO_PROPOSTA_DIAS * 86_400_000).toISOString();
  const aFavor = Object.values(p.votos ?? {}).filter((v) => v === "aprovo").length;
  return {
    tipo: "PROPOSTA",
    id: p.id,
    titulo: `Proposta · ${p.titulo}`,
    solicitante: p.autor,
    dataEntrada: entrada,
    prazo,
    detalhes: [
      { label: "Categoria", valor: CATEGORIA_LABEL[p.categoria] ?? p.categoria },
      { label: "Descrição", valor: p.descricao },
      { label: "Aprovada pela comunidade em", valor: p.aprovadaEm ? formatDataBR(p.aprovadaEm) : "—" },
      { label: "Votos a favor", valor: String(aFavor) },
    ],
    rejeicaoMotivoObrigatorio: true, // proposta exige motivo na rejeição (SÍN-005)
  };
}

function mapDespesa(d: Despesa): Pendencia {
  return {
    tipo: "DESPESA",
    id: d.id,
    titulo: `${d.descricao} · ${formatBRL(d.valor)}`,
    solicitante: d.registradoPor,
    dataEntrada: d.criadoEm,
    // Prazo natural: o vencimento — decidir antes de vencer evita atraso no pagamento.
    prazo: `${d.dataVencimento}T00:00:00`,
    detalhes: [
      { label: "Valor", valor: formatBRL(d.valor) },
      { label: "Categoria", valor: CATEGORIA_DESPESA_LABEL[d.categoria] },
      ...(d.fornecedor ? [{ label: "Fornecedor", valor: d.fornecedor }] : []),
      { label: "Vencimento", valor: formatDataBR(d.dataVencimento) },
    ],
    rejeicaoMotivoObrigatorio: true, // reprovação de despesa exige motivo
  };
}

const SLA_DECISAO_ATA_DIAS = 7;

function mapAta(r: Reuniao): Pendencia {
  // Entrada = data da reunião; prazo = ata deve ser finalizada em até 7 dias.
  const prazo = new Date(new Date(`${r.date}T00:00:00`).getTime() + SLA_DECISAO_ATA_DIAS * 86_400_000).toISOString();
  const trecho = (r.ataContent ?? "").slice(0, 280);
  return {
    tipo: "ATA",
    id: r.id,
    titulo: `Ata · ${r.title}`,
    solicitante: r.createdBy,
    dataEntrada: `${r.date}T00:00:00`,
    prazo,
    detalhes: [
      { label: "Reunião", valor: r.title },
      { label: "Data da reunião", valor: formatDataBR(r.date) },
      { label: "Trecho da ata", valor: trecho + ((r.ataContent ?? "").length > 280 ? "…" : "") },
    ],
    rejeicaoMotivoObrigatorio: true,
  };
}

function mapConvocacao(r: Reuniao): Pendencia {
  // Entrada = criação do rascunho; prazo = a própria data/horário da reunião
  // (a convocação precisa ser publicada antes do encontro acontecer).
  const prazo = `${r.date}T${r.time || "00:00"}:00`;
  const pauta = r.agenda.filter((i) => i && i.trim());
  return {
    tipo: "CONVOCACAO",
    id: r.id,
    titulo: `Reunião · ${r.title}`,
    solicitante: r.createdBy,
    dataEntrada: r.createdAtISO ?? `${r.date}T00:00:00`,
    prazo,
    detalhes: [
      { label: "Data", valor: formatDataBR(r.date) },
      { label: "Horário", valor: `${r.time} (${r.duration}min)` },
      ...(r.description ? [{ label: "Descrição", valor: r.description }] : []),
      ...(pauta.length ? [{ label: "Pauta", valor: pauta.join(" · ") }] : []),
    ],
    // Descartar um rascunho da própria gestão não exige motivo.
    rejeicaoMotivoObrigatorio: false,
  };
}

function mapSolicitacao(s: Solicitacao): Pendencia {
  return {
    tipo: "MANUTENCAO",
    id: s.id,
    titulo: `${s.titulo} · Unidade ${s.unidade}`,
    solicitante: s.solicitante ?? `Unidade ${s.unidade}`,
    dataEntrada: s.aberturaEm,
    detalhes: [
      { label: "Protocolo", valor: s.protocolo },
      { label: "Categoria", valor: s.categoria },
      { label: "Prioridade", valor: PRIORIDADE_LABEL[s.prioridade] },
      { label: "Unidade", valor: s.unidade },
      ...(s.descricao ? [{ label: "Descrição", valor: s.descricao }] : []),
    ],
    rejeicaoMotivoObrigatorio: true,
  };
}

// --- Leitura: lista agregada -------------------------------------------------

export async function listPendenciasAction(): Promise<Pendencia[]> {
  const session = await requireManager();
  if (!session.condominiumId) return [];

  const [reservasData, governanca, despesas, reunioes, solicitacoes] = await Promise.all([
    listReservasAction(),
    listPropostasAction(),
    listDespesasAction(),
    listReunioesAction(),
    listSolicitacoesAguardandoAction(),
  ]);

  const pendencias: Pendencia[] = [];
  for (const r of reservasData.reservas) {
    if (r.status === "pendente") pendencias.push(mapReserva(r));
  }
  for (const p of governanca.propostas) {
    if (p.status === "aprovada_comunidade") pendencias.push(mapProposta(p));
  }
  for (const d of despesas) {
    if (d.status === "AGUARDANDO_APROVACAO") pendencias.push(mapDespesa(d));
  }
  for (const r of reunioes) {
    // Convocação aguardando publicação (rascunho criado pela gestão).
    if (r.status === "draft") pendencias.push(mapConvocacao(r));
    // Ata aguardando homologação (fluxo independente da publicação).
    if (r.ataStatus === "AGUARDANDO_APROVACAO") pendencias.push(mapAta(r));
  }
  for (const s of solicitacoes) {
    pendencias.push(mapSolicitacao(s));
  }

  return ordenarPendencias(pendencias);
}

// --- Decisão: despacha para a ação do módulo de origem -----------------------

export interface DecidirPendenciaInput {
  tipo: PendenciaTipo;
  id: string;
  decisao: Decisao;
  motivo?: string;
}

export type DecidirPendenciaResult = { ok: true } | { ok: false; error: string };

export async function decidirPendenciaAction(input: DecidirPendenciaInput): Promise<DecidirPendenciaResult> {
  // Barra não-gestor cedo; cada ação delegada revalida permissão e escopo.
  await requireManager();
  const motivo = (input.motivo ?? "").trim();

  if (input.tipo === "RESERVA") {
    if (input.decisao === "aprovar") {
      const r = await aprovarReservaAction(input.id);
      return r.ok ? { ok: true } : { ok: false, error: "Não foi possível aprovar a reserva." };
    }
    const r = await rejeitarReservaAction(input.id, motivo);
    return r.ok ? { ok: true } : { ok: false, error: "Não foi possível rejeitar a reserva." };
  }

  if (input.tipo === "PROPOSTA") {
    if (input.decisao === "aprovar") {
      const r = await homologarPropostaAction(input.id);
      return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Não foi possível aprovar a proposta." };
    }
    const r = await rejeitarPropostaAction(input.id, motivo);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  if (input.tipo === "DESPESA") {
    if (input.decisao === "aprovar") {
      const r = await aprovarDespesaAction(input.id);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const r = await reprovarDespesaAction(input.id, motivo);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  if (input.tipo === "ATA") {
    if (input.decisao === "aprovar") {
      const r = await aprovarAtaAction(input.id);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const r = await rejeitarAtaAction(input.id, motivo);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  if (input.tipo === "MANUTENCAO") {
    if (input.decisao === "aprovar") {
      const r = await aprovarSolicitacaoAction(input.id);
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const r = await recusarSolicitacaoAction(input.id, motivo);
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  if (input.tipo === "CONVOCACAO") {
    if (input.decisao === "aprovar") {
      const r = await publicarReuniaoAction(input.id); // publica (rascunho → agendada)
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const r = await descartarReuniaoAction(input.id); // descarta o rascunho
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Não foi possível descartar a convocação." };
  }

  return { ok: false, error: "Tipo de pendência não suportado." };
}
