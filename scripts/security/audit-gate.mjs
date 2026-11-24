#!/usr/bin/env node
// SEG-013 — Gate de auditoria de dependências com exceções documentadas.
//
// Roda `npm audit --json` e falha (exit 1) se houver vulnerabilidade High ou
// Critical em um pacote que NÃO esteja na allowlist de
// security/audit-exceptions.json. Cada exceção precisa de motivo, card de
// correção e data de validade — passada a validade, a exceção deixa de valer
// e o pacote volta a bloquear o pipeline (força reavaliação periódica em vez
// de uma exceção esquecida para sempre).
//
// Limitação conhecida: o match é por NOME do pacote, não pelo ID da
// vulnerabilidade (GHSA). Se uma vulnerabilidade DIFERENTE aparecer no mesmo
// pacote antes do expiresAt, ela também seria aceita até a expiração — por
// isso os prazos em audit-exceptions.json são curtos (semanas, não meses).

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_PATH = path.join(__dirname, "..", "..", "security", "audit-exceptions.json");
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const TODAY = new Date().toISOString().slice(0, 10);

function loadExceptionsFile() {
  return JSON.parse(readFileSync(EXCEPTIONS_PATH, "utf8")).exceptions ?? [];
}

function runAudit() {
  try {
    const out = execSync("npm audit --json", {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
    });
    return JSON.parse(out);
  } catch (err) {
    // npm audit sai com código != 0 quando encontra vulnerabilidades, mas
    // ainda escreve o JSON completo em stdout — é isso que precisamos ler.
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

const allExceptions = loadExceptionsFile();
const activeByPackage = new Map(
  allExceptions.filter((e) => e.expiresAt >= TODAY).map((e) => [e.package, e])
);
const expired = allExceptions.filter((e) => e.expiresAt < TODAY);

const report = runAudit();
const vulns = report.vulnerabilities ?? {};

const accepted = [];
const blocking = [];

for (const [pkg, info] of Object.entries(vulns)) {
  if (!BLOCKING_SEVERITIES.has(info.severity)) continue;
  const exception = activeByPackage.get(pkg);
  if (exception) {
    accepted.push({ pkg, severity: info.severity, ...exception });
  } else {
    blocking.push({ pkg, severity: info.severity });
  }
}

console.log("== SEG-013: gate de auditoria de dependências ==\n");

if (accepted.length) {
  console.log("Risco aceito (documentado, com prazo):");
  for (const a of accepted) {
    console.log(`  - ${a.pkg} [${a.severity}] até ${a.expiresAt} — ${a.reason} (${a.cardRef})`);
  }
  console.log("");
}

if (expired.length) {
  console.log("⚠ Exceções VENCIDAS em security/audit-exceptions.json (revisar):");
  for (const e of expired) {
    console.log(`  - ${e.package} venceu em ${e.expiresAt} — ${e.cardRef}`);
  }
  console.log("");
}

if (blocking.length) {
  console.log("BLOQUEANDO — High/Critical sem exceção válida:");
  for (const b of blocking) {
    console.log(`  - ${b.pkg} [${b.severity}]`);
  }
  console.log("\nCorrija com `npm audit fix` (ou avalie `--force`, que traz breaking");
  console.log("changes), ou registre uma exceção documentada e com prazo em");
  console.log("security/audit-exceptions.json — nunca deixe sem motivo/card/data.");
  process.exit(1);
}

console.log("OK — nenhuma vulnerabilidade High/Critical sem exceção documentada e válida.");
process.exit(0);
