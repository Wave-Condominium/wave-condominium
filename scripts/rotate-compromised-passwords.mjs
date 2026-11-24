// SEG-005 — Rotação de senhas comprometidas (sindico@wave.com / administradora@wave.com).
//
// Por que este script existe:
//   A senha "Senha@12345" dessas contas estava hardcoded em texto no
//   src/components/Login.tsx, publicado no repositório público. Uma vez
//   publicada, a credencial é considerada comprometida — ocultar o botão no
//   código NÃO revoga o acesso. Este script troca a senha real no banco.
//
// O que ele faz, por usuário informado em TARGET_EMAILS:
//   1. Gera uma senha aleatória forte e ÚNICA (uma por conta, nunca reaproveitada).
//   2. Grava o hash com bcryptjs, MESMOS parâmetros do projeto (SALT_ROUNDS=12,
//      ver src/server/auth/password.ts) — para não introduzir um padrão de hash
//      diferente do resto da aplicação.
//   3. Marca mustChangePassword=true — o próprio fluxo do Wave (ForceChangePassword,
//      já usado no primeiro acesso do Morador) obriga o usuário a trocar a senha
//      assim que logar com a senha temporária. NINGUÉM deve continuar usando o
//      valor gerado por este script como senha definitiva.
//   4. Imprime a senha temporária UMA VEZ no terminal (nunca grava em arquivo/log).
//      Repasse por um canal fora de banda (telefone, presencial) ao síndico e à
//      administradora reais — nunca por e-mail em texto puro nem por chat.
//
// O que ele NÃO faz (leia antes de rodar):
//   - Não derruba sessões já abertas dessas contas. O Wave usa JWT httpOnly
//     autocontido (src/server/auth/session.ts), sem consulta ao banco por
//     requisição — uma sessão emitida antes da rotação continua válida até
//     expirar sozinha (MAX_AGE_SECONDS = 8h no momento da auditoria SEG-005).
//     Se precisar invalidar TODAS as sessões de TODOS os usuários agora,
//     a única forma hoje é trocar WAVE_SESSION_SECRET na Vercel (efeito
//     colateral: derruba TODO MUNDO, não só essas duas contas — avalie o
//     custo/benefício antes de fazer isso).
//
// Como rodar (PowerShell, na raiz do projeto):
//   $env:PROD_DATABASE_URL='<connection string de PRODUÇÃO, direta, sem -pooler>'
//   node scripts/rotate-compromised-passwords.mjs --yes
//
// Sem a flag --yes, o script só mostra o que faria (dry-run) e não grava nada.
//
// IMPORTANTE — por que a variável se chama PROD_DATABASE_URL e não DATABASE_URL:
//   O Prisma Client carrega automaticamente o .env do projeto ao ser importado
//   e, como o schema.prisma declara `url = env("DATABASE_URL")`, ele SOBRESCREVE
//   qualquer valor de DATABASE_URL que você tenha setado manualmente no terminal
//   pelo valor do seu .env local — mesmo que você tenha exportado a variável
//   antes de rodar o script. Usando um nome diferente (PROD_DATABASE_URL), o
//   Prisma não mexe nele, e passamos o valor explicitamente para o PrismaClient
//   (datasourceUrl), sem depender do env("DATABASE_URL") do schema.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import readline from "node:readline/promises";

const SALT_ROUNDS = 12; // igual a src/server/auth/password.ts — não mudar sem mudar lá também.

// Ajuste esta lista para os e-mails que você confirmou existirem com a senha
// comprometida. Comece só com os dois confirmados; adicione outros se achar
// mais contas afetadas (ex.: admin@wave.com, morador@wave.com).
const TARGET_EMAILS = ["morador@wave.com", "admin@wave.com"];

const DRY_RUN = !process.argv.includes("--yes");

function gerarSenhaForte(tamanho = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "@#$%!&*";
  const all = upper + lower + digits + symbols;
  const bytes = crypto.randomBytes(tamanho);
  let senha = "";
  for (let i = 0; i < tamanho; i++) {
    senha += all[bytes[i] % all.length];
  }
  return senha;
}

function mascarHost(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return `${u.hostname}${u.pathname}`; // nunca imprime usuário/senha da connection string
  } catch {
    return "(não consegui interpretar a DATABASE_URL — confira o formato)";
  }
}

async function main() {
  const dbUrl = process.env.PROD_DATABASE_URL;
  if (!dbUrl) {
    console.error("ERRO: defina PROD_DATABASE_URL antes de rodar (aponte para o banco correto).");
    console.error('Ex.: $env:PROD_DATABASE_URL="postgresql://..."');
    process.exit(1);
  }
  if (dbUrl.includes("localhost") || dbUrl.includes("wave-homologacao")) {
    console.error(`ERRO: essa URL parece ser de dev/homolog (${mascarHost(dbUrl)}), não de produção.`);
    console.error("Confira antes de continuar — cancelando por segurança.");
    process.exit(1);
  }

  console.log("=".repeat(78));
  console.log("SEG-005 — Rotação de senhas comprometidas");
  console.log("Banco alvo (host/db, sem credenciais):", mascarHost(dbUrl));
  console.log("Contas alvo:", TARGET_EMAILS.join(", "));
  console.log("Modo:", DRY_RUN ? "DRY-RUN (nada será gravado)" : "EXECUÇÃO REAL — vai gravar no banco acima");
  console.log("=".repeat(78));

  if (!DRY_RUN) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const resposta = await rl.question(
      '\nDigite exatamente "CONFIRMO" para prosseguir e gravar no banco acima: '
    );
    rl.close();
    if (resposta.trim() !== "CONFIRMO") {
      console.log("Cancelado — nada foi alterado.");
      process.exit(0);
    }
  }

  // datasourceUrl explícito: garante que este script fala com o banco que
  // VOCÊ passou, e não com o que o Prisma carregar sozinho do .env local.
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  const resultados = [];

  try {
    // SEG-005 — achado à parte: o banco de produção pode estar com o schema
    // desatualizado (migrações pendentes). Por isso usamos SQL cru ($queryRaw/
    // $executeRaw) em vez da API de model do Prisma: assim só mexemos nas
    // colunas que confirmamos existir, sem depender do schema.prisma local
    // bater 100% com o banco de produção.
    const colunas = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'User'
    `;
    const colunasExistentes = new Set(colunas.map((c) => c.column_name));
    const temMustChangePassword = colunasExistentes.has("mustChangePassword");

    if (!temMustChangePassword) {
      console.log(
        '\n⚠ AVISO: a coluna "mustChangePassword" não existe neste banco ainda ' +
        "(schema de produção desatualizado — migrações pendentes, achado à parte " +
        "do SEG-005). A senha será trocada mesmo assim, mas SEM forçar troca no " +
        "primeiro login. Avise manualmente o síndico/administradora para trocarem " +
        "a senha assim que entrarem.\n"
      );
    }

    for (const email of TARGET_EMAILS) {
      const rows = await prisma.$queryRaw`
        SELECT id, role FROM "User" WHERE email = ${email}
      `;
      if (rows.length === 0) {
        console.log(`- ${email}: NÃO encontrado neste banco — pulando.`);
        continue;
      }
      const user = rows[0];

      const novaSenha = gerarSenhaForte();
      const passwordHash = await bcrypt.hash(novaSenha, SALT_ROUNDS);

      if (!DRY_RUN) {
        if (temMustChangePassword) {
          await prisma.$executeRaw`
            UPDATE "User" SET "passwordHash" = ${passwordHash}, "mustChangePassword" = true
            WHERE id = ${user.id}
          `;
        } else {
          await prisma.$executeRaw`
            UPDATE "User" SET "passwordHash" = ${passwordHash}
            WHERE id = ${user.id}
          `;
        }
      }

      resultados.push({ email, novaSenha, role: user.role });
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log("\n" + "=".repeat(78));
  console.log(DRY_RUN ? "DRY-RUN — nenhuma senha foi gravada. Senhas abaixo são só exemplo do formato:" : "CONCLUÍDO — senhas trocadas no banco. Repasse cada uma UMA VEZ, fora de banda:");
  console.log("=".repeat(78));
  for (const r of resultados) {
    console.log(`  ${r.email} (${r.role})  ->  senha temporária: ${r.novaSenha}`);
  }
  console.log("\nO usuário será obrigado a trocar essa senha temporária no primeiro login");
  console.log("(mustChangePassword=true, fluxo já existente do Wave).");
  console.log("Esta é a ÚNICA vez que a senha aparece impressa — não fica salva em log/arquivo.\n");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
