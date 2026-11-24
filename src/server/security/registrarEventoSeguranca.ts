import { headers } from "next/headers";
import { eventoSegurancaRepository } from "@/server/repositories/eventoSegurancaRepository";
import {
  validarResultado,
  type TipoEventoSeguranca,
  type ResultadoEvento,
} from "@/server/security/eventoSeguranca";
import { avaliarAnomalias } from "@/server/security/detectarAnomalias";
import type {
  TipoEventoSeguranca as PrismaTipo,
  ResultadoEventoSeguranca as PrismaResultado,
  Prisma,
} from "@prisma/client";

export interface RegistrarEventoParams {
  tipo: TipoEventoSeguranca;
  resultado: ResultadoEvento;
  userId?: string | null;
  email?: string | null;
  condominiumId?: string | null;
  recurso?: string | null;
  metadata?: Record<string, unknown> | null;
}

function capturarIp(h: Headers): string | null {
  // Atrás de proxy/Vercel, x-forwarded-for pode ter vários IPs (cliente +
  // proxies) separados por vírgula — o primeiro é o do cliente original.
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return h.get("x-real-ip");
}

/**
 * Registra um evento de segurança (SEG-016). NUNCA lança para quem chama —
 * uma falha ao gravar o log não pode derrubar o fluxo de negócio (ex.: login
 * continua funcionando mesmo se o registro do evento falhar). Erros vão só
 * para o console do servidor, para investigação.
 */
export async function registrarEventoSeguranca(
  params: RegistrarEventoParams
): Promise<void> {
  if (!validarResultado(params.tipo, params.resultado)) {
    console.error(
      `[eventoSeguranca] combinação tipo/resultado inválida: ${params.tipo}/${params.resultado}`
    );
    return;
  }

  try {
    let ip: string | null = null;
    let userAgent: string | null = null;
    try {
      const h = await headers();
      ip = capturarIp(h);
      userAgent = h.get("user-agent");
    } catch {
      // headers() só funciona dentro do ciclo de uma requisição (Server
      // Action/Route Handler). Fora disso (script, seed), seguimos sem IP/UA
      // em vez de falhar o registro inteiro.
    }

    await eventoSegurancaRepository.registrar({
      tipo: params.tipo as unknown as PrismaTipo,
      resultado: params.resultado as unknown as PrismaResultado,
      userId: params.userId ?? null,
      email: params.email ?? null,
      condominiumId: params.condominiumId ?? null,
      ip,
      userAgent,
      recurso: params.recurso ?? null,
      // O parâmetro de entrada fica com um tipo simples (Record<string,
      // unknown>) pra quem chama a função; o cast fica só nesta borda com o
      // Prisma, que exige o tipo recursivo InputJsonValue. Quem preenche
      // `metadata` já sabe que deve passar só primitivos JSON-seguros —
      // nunca senha, token ou credencial (ver regra no topo do arquivo).
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    });

    // SEG-016 Fase 2: avalia as regras de anomalia SÓ para os tipos que têm
    // regra definida — evita trabalho e consultas desnecessárias nos demais
    // eventos (login sucesso, logout, senha alterada etc.).
    if (params.tipo === "LOGIN_FALHA" || params.tipo === "ACESSO_NEGADO") {
      await avaliarAnomalias({
        tipoEvento: params.tipo,
        userId: params.userId ?? null,
        email: params.email ?? null,
        ip,
        condominiumId: params.condominiumId ?? null,
      });
    }
  } catch (err) {
    console.error("[eventoSeguranca] falha ao registrar evento de segurança", err);
  }
}
