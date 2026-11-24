import { NextRequest, NextResponse } from "next/server";
import { eventoSegurancaRepository } from "@/server/repositories/eventoSegurancaRepository";
import { calcularDataCorte } from "@/server/security/eventoSeguranca";

// Sem isso, o Next tenta pré-renderizar esta rota como estática no build
// (não usa nenhuma API "dinâmica" de forma incondicional) e falha, porque
// não há banco acessível durante o build — só em runtime, quando o cron
// realmente dispara. `force-dynamic` garante que ela SEMPRE roda sob
// demanda, nunca é gerada estaticamente.
export const dynamic = "force-dynamic";

/**
 * SEG-016 Fase 2 — expurgo de retenção (12 meses), acionado pelo Vercel Cron
 * (ver vercel.json). Protegido por CRON_SECRET: o Vercel injeta
 * `Authorization: Bearer <CRON_SECRET>` nas chamadas de cron quando essa env
 * var está configurada — sem ela configurada, a rota aceita a chamada
 * (comportamento do próprio Vercel Cron), mas então NENHUMA outra origem
 * deveria conseguir alcançar esta rota; configurar CRON_SECRET no projeto é
 * o que fecha essa lacuna.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "não autorizado" }, { status: 401 });
    }
  }

  const dataCorte = calcularDataCorte(new Date());
  const removidos = await eventoSegurancaRepository.expurgarAntigos(dataCorte);

  return NextResponse.json({ ok: true, removidos, dataCorte: dataCorte.toISOString() });
}
