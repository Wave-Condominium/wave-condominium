'use client';

// ---------------------------------------------------------------------------
// src/components/staff/useProfissionais.ts
//
// Acesso aos profissionais (funcionários/prestadores) do condomínio.
//
// Hoje lê de localStorage com dados de demonstração (padrão do protótipo). A
// mesma chave será usada pela futura tela de gestão de Síndico/Administradora,
// então o dado já nasce num lugar único e compartilhável — sem reescrever a
// origem quando o backend/gestão chegar.
// ---------------------------------------------------------------------------

import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  DEFAULT_PROFISSIONAIS,
  PROFISSIONAIS_STORAGE_KEY,
  selectProfissionaisVisiveis,
  type Profissional,
} from './profissionais';

export function useProfissionais() {
  const [profissionais] = useLocalStorage<Profissional[]>(
    PROFISSIONAIS_STORAGE_KEY,
    DEFAULT_PROFISSIONAIS,
  );

  // Apenas leitura para o Morador: expõe somente a lista visível (ativos,
  // ordenada). A escrita ficará com a futura tela de gestão.
  return { profissionais: selectProfissionaisVisiveis(profissionais) };
}
