// ---------------------------------------------------------------------------
// src/server/access/token.ts
//
// Geração e verificação do token de ativação de convites (SÍN-022). SERVER-ONLY
// (usa node:crypto). Segurança:
//   - o token em claro (128 bits de entropia) só existe em memória e no link de
//     ativação — NUNCA é persistido;
//   - no banco guardamos apenas o SHA-256 (hex) do token (`tokenHash`), de modo
//     que um vazamento do banco não permite ativar convites;
//   - a busca na ativação é feita pelo hash do token recebido, comparado ao
//     `tokenHash` @unique.
// ---------------------------------------------------------------------------

import { randomBytes, createHash } from "node:crypto";

export interface TokenGerado {
  /** Token em claro — vai apenas no link de ativação, nunca ao banco. */
  token: string;
  /** SHA-256 hex do token — o único valor persistido. */
  tokenHash: string;
}

/** SHA-256 (hex) de um token — usado ao gerar e ao verificar na ativação. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Gera um token de ativação seguro (256 bits) e seu hash. */
export function gerarToken(): TokenGerado {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
