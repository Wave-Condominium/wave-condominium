// ---------------------------------------------------------------------------
// src/lib/rbac.ts
//
// Fonte única de verdade para checagem de papéis (RBAC).
//
// Antes desta mudança, cada componente reimplementava sua própria
// comparação de string para "é gestor?" — e cada um usava uma grafia
// diferente ('Admin', 'Administrador', 'Administradora'), nenhuma das
// quais o login de fato produzia. Resultado: funcionalidades inteiras
// (ex: botão "Simular Compensação" em Boletos) ficavam permanentemente
// inacessíveis, mesmo para quem deveria ter permissão.
//
// A partir de agora, qualquer componente novo usa isManager/isPlatformAdmin
// em vez de comparar `role === '...'` diretamente — elimina essa classe
// inteira de bug e mantém a regra de negócio em um único lugar.
//
// Modelo de papéis (decisão de produto): Admin é um superset de Síndico —
// tudo que Síndico pode fazer, Admin também pode, mais alguns recursos
// exclusivos de plataforma (ex: simular compensação de pagamento Stellar).
// ---------------------------------------------------------------------------

import type { User } from '@/hooks/useAuth';

export type Role = User['role'];

/**
 * Papéis com permissão de gestão do condomínio (Síndico e Admin).
 * Use para: emitir boletos, criar reuniões, aprovar propostas/documentos
 * (Admin Panel), criar novas contas de usuário.
 */
export function isManager(role: Role | undefined | null): boolean {
  return role === 'Síndico' || role === 'Admin' || role === 'Administradora';
}

/**
 * Exclusivo de Admin — recursos de plataforma que nem Síndico acessa.
 * Use para: simular compensação de pagamento Stellar (Boletos).
 */
export function isPlatformAdmin(role: Role | undefined | null): boolean {
  return role === 'Admin';
}

/**
 * Administradora: canal B2B2C que gere MULTIPLOS condominios. Superset do
 * Sindico para os condominios sob sua gestao (hierarquia
 * administradora > sindico > morador). Use para: painel multi-condominio,
 * troca de condominio ativo, gestao consolidada.
 */
export function isAdministradora(role: Role | undefined | null): boolean {
  return role === 'Administradora';
}

/**
 * Conselho (SÍN-031): papel de leitura + participação num condomínio, SEM ações
 * de gestão. NÃO é `isManager` — não emite boletos, não cria reuniões, não
 * aprova na Central. Fica abaixo de Síndico. O papel é POR condomínio (o mesmo
 * usuário pode ser Síndico em um e Conselho em outro), resolvido no login/troca.
 */
export function isConselho(role: Role | undefined | null): boolean {
  return role === 'Conselho';
}