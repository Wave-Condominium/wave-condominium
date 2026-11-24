#!/usr/bin/env node
// SEG-006 — Teste 2: varredura do bundle do cliente por padrões de segredo.
//
// Roda DEPOIS de `npm run build` (precisa do diretório .next gerado).
// Escaneia SÓ .next/static/ — é a única parte do build que vai pro
// navegador. (.next/server/ roda no servidor e pode legitimamente conter
// segredos — nunca escaneie essa pasta esperando "estar limpa".)
//
// Detecta padrões ESTRUTURADOS de segredo (connection string, chave privada,
// prefixos conhecidos de API key). Não substitui uma revisão manual das
// variáveis NEXT_PUBLIC_* (isso é o Teste 1, feito por leitura de código).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const CLIENT_DIR = path.join(process.cwd(), ".next", "static");

const PATTERNS = [
  { name: "Connection string com credenciais", re: /(postgres(ql)?|mysql|mongodb):\/\/[^\s"'`]+:[^\s"'`]+@/gi },
  { name: "Chave privada PEM", re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "Stripe live key", re: /\bsk_live_[A-Za-z0-9]+/g },
  { name: "AWS Access Key ID", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "Chave secreta Stellar (formato S...)", re: /\bS[A-Z0-9]{55}\b/g },
  { name: "JWT com 3 segmentos base64", re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
];

function listJsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function main() {
  let files;
  try {
    files = listJsFiles(CLIENT_DIR);
  } catch {
    console.error(`Não encontrei ${CLIENT_DIR} — rode "npm run build" antes deste script.`);
    process.exit(2);
  }

  console.log(`== SEG-006 Teste 2: varredura do bundle do cliente ==\n`);
  console.log(`Escaneando ${files.length} arquivo(s) .js em .next/static/...\n`);

  let achou = false;
  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const { name, re } of PATTERNS) {
      const matches = content.match(re);
      if (matches) {
        achou = true;
        console.log(`⚠ ${name} em ${path.relative(process.cwd(), file)}:`);
        for (const m of new Set(matches)) {
          // Nunca imprime o achado inteiro — só os primeiros/últimos
          // caracteres, o suficiente pra localizar sem re-vazar o segredo
          // no próprio log do terminal.
          const preview = m.length > 16 ? `${m.slice(0, 8)}...${m.slice(-4)}` : "(curto demais p/ preview seguro)";
          console.log(`    ${preview}`);
        }
      }
    }
  }

  if (achou) {
    console.log("\nBLOQUEANTE — padrão de segredo estruturado encontrado no bundle do cliente.");
    console.log("Investigue o arquivo apontado, identifique a variável de origem, e mova-a");
    console.log("para uma env var SEM o prefixo NEXT_PUBLIC_ (só o servidor deve lê-la).");
    process.exit(1);
  }

  console.log("OK — nenhum padrão de segredo estruturado encontrado em .next/static/.");
  process.exit(0);
}

main();
