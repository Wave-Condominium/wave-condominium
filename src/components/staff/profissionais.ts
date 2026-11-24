// ---------------------------------------------------------------------------
// src/components/staff/profissionais.ts
//
// Funcionários e prestadores contratados que trabalham no condomínio (MOR-021).
//
// Fonte única de dados e lógica pura (sem JSX) para a seção que o Morador
// consulta no dashboard. Hoje os dados são de demonstração (client-side, no
// mesmo padrão dos demais módulos do protótipo). O cadastro/gestão é
// responsabilidade exclusiva de Síndico/Administradora — será um card
// próprio; por isso este módulo já expõe a lista via chave de localStorage
// compartilhável, para que uma futura tela de gestão escreva no mesmo lugar.
//
// RBAC: a garantia "somente leitura" para o Morador é estrutural — a seção que
// o consome (ProfissionaisSection) não possui nenhum controle de mutação.
// ---------------------------------------------------------------------------

/** Vínculo do profissional com o condomínio. */
export type Vinculo = 'funcionario' | 'prestador';

export interface Profissional {
  id: string;
  nome: string;
  /** Função/cargo exercido (ex.: Zelador, Porteiro, Eletricista). */
  funcao: string;
  vinculo: Vinculo;
  /** Área de atuação (ex.: Portaria, Limpeza, Segurança). Opcional. */
  categoria?: string;
  /** URL da foto de perfil. Opcional — sem foto, a UI usa as iniciais. */
  fotoUrl?: string;
  /** Apenas profissionais ativos (contratados/vinculados) são exibidos. */
  ativo: boolean;
}

/** Chave de persistência (compartilhada com a futura tela de gestão). */
export const PROFISSIONAIS_STORAGE_KEY = 'wave_profissionais';

/** Rótulos de exibição do vínculo. */
export const VINCULO_LABEL: Record<Vinculo, string> = {
  funcionario: 'Funcionário',
  prestador: 'Prestador',
};

/**
 * Dados de demonstração. Um item inativo (ex-prestador) é incluído de propósito
 * para exercitar o filtro de ativos.
 */
export const DEFAULT_PROFISSIONAIS: Profissional[] = [
  { id: 'PRO-001', nome: 'Carlos Andrade',   funcao: 'Zelador',            vinculo: 'funcionario', categoria: 'Zeladoria',  ativo: true },
  { id: 'PRO-002', nome: 'Marta Nogueira',   funcao: 'Porteira (diurno)',  vinculo: 'funcionario', categoria: 'Portaria',   ativo: true },
  { id: 'PRO-003', nome: 'José Ferreira',    funcao: 'Porteiro (noturno)', vinculo: 'funcionario', categoria: 'Portaria',   ativo: true },
  { id: 'PRO-004', nome: 'Auxiliadora Lima', funcao: 'Auxiliar de Limpeza',vinculo: 'funcionario', categoria: 'Limpeza',    ativo: true },
  { id: 'PRO-005', nome: 'SegurMais Ltda',   funcao: 'Segurança Patrimonial', vinculo: 'prestador', categoria: 'Segurança', ativo: true },
  { id: 'PRO-006', nome: 'Verde Vivo Jardins', funcao: 'Jardinagem',       vinculo: 'prestador',   categoria: 'Jardinagem', ativo: true },
  { id: 'PRO-007', nome: 'Antigo Fornecedor', funcao: 'Elétrica',          vinculo: 'prestador',   categoria: 'Manutenção', ativo: false },
];

const VINCULO_ORDER: Record<Vinculo, number> = { funcionario: 0, prestador: 1 };

/**
 * Seleciona os profissionais que devem aparecer para o Morador: apenas os
 * ativos (contratados/vinculados ao condomínio), com funcionários antes de
 * prestadores e, dentro de cada grupo, em ordem alfabética.
 *
 * Função pura — não muta a entrada; testável sem DOM.
 */
export function selectProfissionaisVisiveis(lista: Profissional[]): Profissional[] {
  return lista
    .filter((p) => p.ativo)
    .slice()
    .sort((a, b) => {
      const byVinculo = VINCULO_ORDER[a.vinculo] - VINCULO_ORDER[b.vinculo];
      if (byVinculo !== 0) return byVinculo;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });
}

/** Iniciais para o avatar quando não há foto (ex.: "Carlos Andrade" → "CA"). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
