'use client';

// ---------------------------------------------------------------------------
// src/components/CondominioSwitcher.tsx
//
// Seletor de condomínio ativo (SÍN-031) para usuários vinculados a mais de um
// condomínio — ex.: síndico profissional. Some quando o usuário tem 0 ou 1
// vínculo (nada a trocar). Ao selecionar, reemite a sessão no servidor (com o
// papel daquele condomínio) e recarrega a app para refletir dados + permissões
// do novo contexto. Deixa claro qual condomínio/papel está ativo.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Loader2 } from 'lucide-react';
import {
  meusCondominiosAction,
  selecionarMeuCondominioAction,
  type MeuCondominio,
} from '@/app/actions/meusCondominios';

export function CondominioSwitcher() {
  const [condominios, setCondominios] = useState<MeuCondominio[]>([]);
  const [ativoId, setAtivoId] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);

  useEffect(() => {
    let alive = true;
    meusCondominiosAction()
      .then((r) => {
        if (!alive) return;
        setCondominios(r.condominios);
        setAtivoId(r.ativoId);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Só aparece para quem tem mais de um condomínio.
  if (condominios.length < 2) return null;

  const ativo = condominios.find((c) => c.id === ativoId) ?? null;

  async function trocar(id: string) {
    if (id === ativoId || trocando) return;
    setTrocando(true);
    const res = await selecionarMeuCondominioAction(id);
    if (!res.ok) {
      setTrocando(false);
      return;
    }
    // Recarrega para refletir o novo contexto (dados e permissões) em toda a app.
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-wave-800 px-4 py-2.5 sm:px-6 text-white">
      <div className="flex items-center gap-2 min-w-0">
        <Building2 className="w-4 h-4 flex-shrink-0 text-wave-200" />
        <span className="text-sm truncate">
          Condomínio ativo: <strong className="font-medium">{ativo?.name ?? '—'}</strong>
          {ativo && <span className="ml-1 text-wave-200">· {ativo.role}</span>}
        </span>
      </div>

      <div className="relative self-start sm:self-auto">
        <label htmlFor="cond-switcher" className="sr-only">
          Trocar de condomínio
        </label>
        <select
          id="cond-switcher"
          value={ativoId ?? ''}
          disabled={trocando}
          onChange={(e) => trocar(e.target.value)}
          className="appearance-none min-h-[44px] rounded-lg bg-white/10 pl-3 pr-9 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 disabled:opacity-60"
        >
          {condominios.map((c) => (
            <option key={c.id} value={c.id} className="text-wave-800">
              {c.name} — {c.role}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2">
          {trocando ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white" />
          )}
        </span>
      </div>
    </div>
  );
}
