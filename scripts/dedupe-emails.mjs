// ---------------------------------------------------------------------------
// scripts/dedupe-emails.mjs  —  SÍN-031
//
// Segurança de deploy do multi-condomínio: a migração
// `20260906000000_multi_condominio_membership` torna o e-mail do usuário ÚNICO
// GLOBAL. Em bases antigas, um mesmo síndico profissional podia existir como
// CONTAS SEPARADAS (mesmo e-mail em condomínios diferentes) — o que faria o
// `CREATE UNIQUE INDEX` de e-mail FALHAR. Este utilitário detecta e (opcional)
// consolida essas contas ANTES da migração, preservando o acesso a todos os
// condomínios como vínculos (CondominiumMembership).
//
// Como a regra antiga era @@unique([condominiumId, email]), duplicatas do mesmo
// e-mail estão SEMPRE em condomínios diferentes — logo não há colisão de votos
// nem de confirmações de presença ao repontar (proposta/reunião pertencem a um
// único condomínio). Isso torna a fusão segura.
//
// ─── Runbook de PRODUÇÃO ────────────────────────────────────────────────────
//   1) node scripts/dedupe-emails.mjs                 # DETECTA (somente leitura)
//      → "nenhuma duplicata": pode migrar direto.
//      → listou duplicatas: rode o passo 2.
//   2) node scripts/dedupe-emails.mjs --apply         # CONSOLIDA (pré-migração)
//      → funde as contas, repontando dados; grava scripts/pending-memberships.json
//   3) npx prisma migrate deploy                      # agora o e-mail único aplica
//   4) node scripts/dedupe-emails.mjs --finalize      # cria os vínculos do JSON
//
// Em local/homolog (seed sem e-mails repetidos) o passo 1 já diz "nenhuma
// duplicata" — nada a fazer.
// ---------------------------------------------------------------------------

import { PrismaClient } from "@prisma/client";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const prisma = new PrismaClient();
const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "pending-memberships.json");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const FINALIZE = args.has("--finalize");

// Prioridade para escolher a conta CANÔNICA (a que sobrevive). Papel mais alto
// primeiro; empate → conta mais antiga. A escolha é cosmética: TODOS os papéis
// viram vínculos por condomínio de qualquer forma.
const ROLE_RANK = { ADMIN: 0, ADMINISTRADORA: 1, SINDICO: 2, CONSELHO: 3, MORADOR: 4 };

function escolherCanonica(rows) {
  return [...rows].sort((a, b) => {
    const r = (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99);
    if (r !== 0) return r;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  })[0];
}

// --- Agrupa usuários por e-mail e devolve só os e-mails com > 1 conta ---------
async function encontrarDuplicatas() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, condominiumId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const porEmail = new Map();
  for (const u of users) {
    const key = (u.email || "").toLowerCase().trim();
    if (!key) continue;
    if (!porEmail.has(key)) porEmail.set(key, []);
    porEmail.get(key).push(u);
  }
  return [...porEmail.entries()].filter(([, rows]) => rows.length > 1);
}

// --- DETECÇÃO (somente leitura) ---------------------------------------------
async function detectar() {
  const dups = await encontrarDuplicatas();
  if (dups.length === 0) {
    console.log("✓ Nenhuma duplicata de e-mail. Seguro aplicar a migração de e-mail único.");
    return;
  }
  console.log(`⚠ ${dups.length} e-mail(s) com contas em mais de um condomínio:\n`);
  for (const [email, rows] of dups) {
    const canon = escolherCanonica(rows);
    console.log(`  ${email}  (${rows.length} contas)`);
    for (const r of rows) {
      const tag = r.id === canon.id ? "→ canônica" : "  duplicada";
      console.log(`    ${tag}  id=${r.id}  role=${r.role}  condominiumId=${r.condominiumId}  "${r.name}"`);
    }
    console.log("");
  }
  console.log("Rode com --apply para consolidar (pré-migração). NENHUMA alteração foi feita.");
  process.exitCode = 2; // sinaliza "há pendências" para CI/scripts
}

// --- CONSOLIDAÇÃO (pré-migração, escreve o JSON de vínculos) ------------------
async function consolidar() {
  const dups = await encontrarDuplicatas();
  if (dups.length === 0) {
    console.log("✓ Nenhuma duplicata. Nada a consolidar.");
    writeFileSync(JSON_PATH, JSON.stringify([], null, 2));
    return;
  }

  const vinculos = []; // { userId, condominiumId, role }

  for (const [email, rows] of dups) {
    const canon = escolherCanonica(rows);
    const duplicadas = rows.filter((r) => r.id !== canon.id);

    await prisma.$transaction(async (tx) => {
      for (const dup of duplicadas) {
        // Reponta os dados que referenciam o usuário. Como as contas estão em
        // condomínios diferentes, não há colisão de unique (votos/presenças).
        await tx.voto.updateMany({ where: { userId: dup.id }, data: { userId: canon.id } });
        await tx.confirmacaoPresenca.updateMany({ where: { userId: dup.id }, data: { userId: canon.id } });
        await tx.proposta.updateMany({ where: { rejeitadaPorId: dup.id }, data: { rejeitadaPorId: canon.id } });
        await tx.solicitacaoServico.updateMany({ where: { solicitanteId: dup.id }, data: { solicitanteId: canon.id } });
        // Sessões da conta duplicada são descartáveis (cascade ao remover).
        // Guarda o acesso da duplicata como vínculo do usuário canônico.
        if (dup.condominiumId) vinculos.push({ userId: canon.id, condominiumId: dup.condominiumId, role: dup.role });
        await tx.user.delete({ where: { id: dup.id } });
      }
    });

    // Acesso próprio da conta canônica (o backfill da migração também o cria;
    // o --finalize é idempotente, então incluir aqui não gera duplicidade).
    if (canon.condominiumId) vinculos.push({ userId: canon.id, condominiumId: canon.condominiumId, role: canon.role });

    console.log(`✓ ${email}: ${duplicadas.length} conta(s) fundida(s) em ${canon.id} (${canon.role}).`);
  }

  writeFileSync(JSON_PATH, JSON.stringify(vinculos, null, 2));
  console.log(`\nGravado ${vinculos.length} vínculo(s) em ${JSON_PATH}.`);
  console.log("Próximo: `npx prisma migrate deploy` e depois `node scripts/dedupe-emails.mjs --finalize`.");
}

// --- FINALIZE (pós-migração: cria os vínculos do JSON, idempotente) ----------
async function finalizar() {
  if (!prisma.condominiumMembership) {
    console.error("✗ A migração de multi-condomínio ainda não foi aplicada (sem tabela de vínculos). Rode `npx prisma migrate deploy` antes de --finalize.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(JSON_PATH)) {
    console.log("Nada a finalizar: scripts/pending-memberships.json não existe (nenhuma consolidação foi feita).");
    return;
  }
  const vinculos = JSON.parse(readFileSync(JSON_PATH, "utf8"));
  let criados = 0;
  for (const v of vinculos) {
    await prisma.condominiumMembership.upsert({
      where: { userId_condominiumId: { userId: v.userId, condominiumId: v.condominiumId } },
      update: { role: v.role },
      create: { userId: v.userId, condominiumId: v.condominiumId, role: v.role },
    });
    criados++;
  }
  console.log(`✓ ${criados} vínculo(s) garantido(s) (upsert idempotente).`);
}

async function main() {
  if (FINALIZE) return finalizar();
  if (APPLY) return consolidar();
  return detectar();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
