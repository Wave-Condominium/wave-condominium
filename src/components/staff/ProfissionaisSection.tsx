'use client';

// ---------------------------------------------------------------------------
// src/components/staff/ProfissionaisSection.tsx
//
// Seção "Funcionários e Prestadores" do dashboard do Morador (MOR-021).
//
// SOMENTE LEITURA: o Morador conhece os profissionais vinculados ao condomínio
// (nome, função/cargo, foto quando houver). Não há nenhum controle de
// cadastro/edição/exclusão — isso é exclusivo de Síndico/Administradora (card
// próprio). A avaliação do atendimento entra quando a plataforma disponibilizar.
// ---------------------------------------------------------------------------

import { Users, Wrench, Shield } from 'lucide-react';

import { useProfissionais } from './useProfissionais';
import { iniciais, VINCULO_LABEL, type Profissional } from './profissionais';

export function ProfissionaisSection() {
  const { profissionais } = useProfissionais();

  return (
    <section
      aria-labelledby="profissionais-title"
      className="rounded-2xl border border-wave-100 bg-white/80 p-5 shadow-sm backdrop-blur-sm sm:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-wave-100 p-2 text-wave-600">
          <Users className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 id="profissionais-title" className="text-wave-800">
          Funcionários e Prestadores
          {profissionais.length > 0 && (
            <span className="ml-1 text-sm text-wave-400">({profissionais.length})</span>
          )}
        </h2>
      </div>

      {profissionais.length === 0 ? (
        <p className="py-6 text-center text-sm text-wave-400">
          Nenhum profissional cadastrado pelo condomínio ainda.
        </p>
      ) : (
        <ul className="space-y-3">
          {profissionais.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-wave-100 p-3">
              <Avatar profissional={p} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-wave-800">{p.nome}</p>
                <p className="truncate text-xs text-wave-500">{p.funcao}</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-wave-50 px-2.5 py-0.5 text-xs text-wave-600">
                {p.vinculo === 'prestador' ? (
                  <Wrench className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Shield className="h-3 w-3" aria-hidden="true" />
                )}
                {VINCULO_LABEL[p.vinculo]}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-wave-400">
        Equipe que atende o condomínio. O cadastro é feito pela administração.
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Avatar: usa a foto quando houver; caso contrário, as iniciais do nome.
// ---------------------------------------------------------------------------

function Avatar({ profissional }: { profissional: Profissional }) {
  const { nome, fotoUrl } = profissional;

  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={nome}
        className="h-10 w-10 shrink-0 rounded-full border border-wave-200 object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-wave-200 bg-wave-100 text-sm font-medium text-wave-600"
      aria-hidden="true"
    >
      {iniciais(nome)}
    </div>
  );
}
