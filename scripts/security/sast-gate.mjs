#!/usr/bin/env node
// SEG-021 — Gate de SAST (Semgrep) com exceções documentadas.
//
// Roda `semgrep scan --json` (já executado antes de chamar este script, que
// só LÊ o relatório) e falha (exit 1) se houver algum finding BLOQUEANTE que
// NÃO esteja em security/sast-exceptions.json. Mesma filosofia do
// audit-gate.mjs (SEG-013): exceção sempre com motivo, card de correção e
// prazo de validade — nunca uma exclusão silenciosa.
//
// IMPORTANTE (descoberto testando de verdade, não suposto): o Semgrep usa
// DUAS terminologias de severidade dependendo da regra — regras clássicas de
// padrão de código relatam "ERROR"/"WARNING"/"INFO", enquanto regras mais
// novas de configuração/supply-chain (ex.: dependabot, GitHub Actions)
// relatam direto "CRITICAL"/"HIGH"/"MEDIUM"/"LOW". Tratamos qualquer uma das
// duas como bloqueante quando equivalente a High/Critical.
const BLOCKING_SEVERITIES = new Set(["ERROR", "CRITICAL", "HIGH"]);

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(process.cwd(), "semgrep-report.json");
const EXCEPTIONS_PATH = path.join(__dirname, "..", "..", "security", "sast-exceptions.json");
const TODAY = new Date().toISOString().slice(0, 10);

function loadExceptions() {
  const raw = JSON.parse(readFileSync(EXCEPTIONS_PATH, "utf8")).exceptions ?? [];
  return raw;
}

function matches(exception, finding) {
  if (exception.checkId !== finding.checkId) return false;
  // path é opcional: se ausente, a exceção vale para QUALQUER ocorrência
  // dessa regra (exceção ampla — documentar o motivo com cuidado extra).
  if (exception.path && exception.path !== finding.path) return false;
  return true;
}

const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
const allFindings = (report.results ?? []).map((r) => ({
  checkId: r.check_id,
  path: r.path,
  line: r.start?.line,
  severity: r.extra?.severity ?? "INFO",
  message: r.extra?.message ?? "",
}));

const blockingCandidates = allFindings.filter((f) => BLOCKING_SEVERITIES.has(f.severity));
const allExceptions = loadExceptions();
const activeExceptions = allExceptions.filter((e) => e.expiresAt >= TODAY);
const expiredExceptions = allExceptions.filter((e) => e.expiresAt < TODAY);

const accepted = [];
const blocking = [];

for (const finding of blockingCandidates) {
  const exception = activeExceptions.find((e) => matches(e, finding));
  if (exception) {
    accepted.push({ finding, exception });
  } else {
    blocking.push(finding);
  }
}

console.log("== SEG-021: gate de SAST (Semgrep) ==\n");
console.log(`Findings bloqueantes (ERROR/CRITICAL/HIGH): ${blockingCandidates.length} — demais severidades: ${allFindings.length - blockingCandidates.length} (no relatório completo, não bloqueiam)\n`);

if (accepted.length) {
  console.log("Risco aceito (documentado, com prazo):");
  for (const { finding, exception } of accepted) {
    console.log(
      `  - ${finding.checkId} em ${finding.path}:${finding.line} até ${exception.expiresAt} — ${exception.reason} (${exception.cardRef})`
    );
  }
  console.log("");
}

if (expiredExceptions.length) {
  console.log("⚠ Exceções VENCIDAS em security/sast-exceptions.json (revisar):");
  for (const e of expiredExceptions) {
    console.log(`  - ${e.checkId} venceu em ${e.expiresAt} — ${e.cardRef}`);
  }
  console.log("");
}

if (blocking.length) {
  console.log("BLOQUEANDO — findings ERROR/CRITICAL/HIGH sem exceção válida:");
  for (const f of blocking) {
    console.log(`  - ${f.checkId} em ${f.path}:${f.line} — ${f.message}`);
  }
  console.log("\nCorrija o código apontado, ou registre uma exceção documentada e com");
  console.log("prazo em security/sast-exceptions.json — nunca deixe sem motivo/card/data.");
  process.exit(1);
}

console.log("OK — nenhum finding ERROR/CRITICAL/HIGH sem exceção documentada e válida.");
process.exit(0);
