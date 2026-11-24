"use client";

import { EventosSegurancaPanel } from "@/components/security/EventosSegurancaPanel";

export default function SecurityEventsPage() {
  // RBAC real é aplicado no SERVIDOR (listarEventosSegurancaAction, via
  // resolverEscopoConsulta). Esta página não faz gate próprio no cliente —
  // deixa o painel tratar o estado "sem permissão" vindo da action, para não
  // duplicar a regra em dois lugares.
  return <EventosSegurancaPanel />;
}
