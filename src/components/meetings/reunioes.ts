// ---------------------------------------------------------------------------
// src/components/meetings/reunioes.ts
//
// Modelo de aplicação e lógica PURA das Reuniões (migração p/ banco, SÍN-026).
// Sem React/DOM nem imports de servidor — testável no Vitest.
//
// O tipo de aplicação mantém a mesma forma que o módulo já usava (localStorage),
// para minimizar mudanças na UI. As Server Actions mapeiam o enum do Prisma
// (AGENDADA/EM_ANDAMENTO/CONCLUIDA) de/para estes rótulos-string.
// ---------------------------------------------------------------------------

// SÍN-026 (Convocações): a reunião nasce como 'draft' (rascunho) e só fica
// visível aos moradores quando o síndico a publica na Central de Aprovações
// (publicar → 'scheduled'; rejeitar → descarta o rascunho).
export type StatusReuniao = 'draft' | 'scheduled' | 'ongoing' | 'completed';

export const STATUS_REUNIAO_LABEL: Record<StatusReuniao, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  ongoing: 'Ao Vivo',
  completed: 'Concluída',
};

/** Rascunho de convocação — visível apenas à gestão até ser publicado. */
export function ehRascunhoConvocacao(status: StatusReuniao): boolean {
  return status === 'draft';
}

// SÍN-026 (Etapa B): ciclo de aprovação da ata.
export type StatusAta = 'RASCUNHO' | 'AGUARDANDO_APROVACAO' | 'OFICIAL';

export const STATUS_ATA_LABEL: Record<StatusAta, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  OFICIAL: 'Oficial',
};

export const STATUS_ATA_COR: Record<StatusAta, string> = {
  RASCUNHO: 'bg-wave-100 text-wave-600',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-700',
  OFICIAL: 'bg-brand-teal/15 text-brand-teal',
};

/** A ata só pode ser editada enquanto não for OFICIAL (integridade travada). */
export function podeEditarAta(ataStatus?: StatusAta): boolean {
  return ataStatus !== 'OFICIAL';
}

export interface Reuniao {
  id: string;
  title: string;
  description: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:mm' */
  time: string;
  /** minutos */
  duration: number;
  meetLink: string;
  status: StatusReuniao;
  /** Confirmados — derivado da contagem de confirmações (não é armazenado). */
  participants: number;
  maxParticipants: number;
  agenda: string[];
  createdBy: string;
  /** Data de criação já formatada (pt-BR) para exibição direta na UI. */
  createdAt: string;
  /** Data de criação em ISO — usada pela Central para ordenar/derivar prazos. */
  createdAtISO?: string;
  /** Ata + código de integridade (MOR-033). */
  ataContent?: string;
  ataHash?: string;
  recordingUrl?: string;
  /** Ciclo de aprovação da ata (Etapa B). */
  ataStatus?: StatusAta;
  ataMotivoRejeicao?: string;
}

export interface NovaReuniaoInput {
  title: string;
  description: string;
  date: string;
  time: string;
  duration: number;
  meetLink: string;
  maxParticipants: number;
  agenda: string[];
}

/** Valida os campos obrigatórios de uma nova reunião. Msg de erro ou null. */
export function validarNovaReuniao(input: Partial<NovaReuniaoInput>): string | null {
  if (!input.title || !input.title.trim()) return 'Informe o título da reunião.';
  if (!input.description || !input.description.trim()) return 'Informe a descrição da reunião.';
  if (!input.date) return 'Informe a data da reunião.';
  if (!input.time) return 'Informe o horário da reunião.';
  const pauta = (input.agenda ?? []).filter((i) => i && i.trim());
  if (pauta.length === 0) return 'Inclua ao menos um item de pauta.';
  return null;
}
