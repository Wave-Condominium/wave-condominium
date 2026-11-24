-- SÍN-031 — Modelagem multi-condomínio (Síndico/Administradora com N condomínios)
--
-- 1) Novo papel CONSELHO. 2) Identidade fiscal (CNPJ) e subconta PSP por
-- condomínio. 3) Tabela de vínculo usuário↔condomínio com papel por condomínio
-- (fonte de verdade do acesso). 4) Backfill: cada vínculo atual vira 1 membership.
-- 5) E-mail passa a ser identidade GLOBAL única (uma pessoa = uma conta).
--
-- Pré-condição da etapa 5: não podem existir e-mails repetidos entre condomínios
-- (na base de seed/homolog não há). Se a base de produção tiver contas duplicadas
-- do mesmo e-mail, elas devem ser consolidadas ANTES de aplicar esta migração.

-- 1) Papel CONSELHO ----------------------------------------------------------
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONSELHO' BEFORE 'MORADOR';

-- 2) CNPJ + subconta PSP por condomínio --------------------------------------
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "pspSubcontaId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Condominium_cnpj_key" ON "Condominium"("cnpj");
CREATE UNIQUE INDEX IF NOT EXISTS "Condominium_pspSubcontaId_key" ON "Condominium"("pspSubcontaId");

-- 3) Vínculo usuário↔condomínio (papel por condomínio) -----------------------
CREATE TABLE IF NOT EXISTS "CondominiumMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CondominiumMembership_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CondominiumMembership_userId_condominiumId_key"
    ON "CondominiumMembership"("userId", "condominiumId");
CREATE INDEX IF NOT EXISTS "CondominiumMembership_condominiumId_idx"
    ON "CondominiumMembership"("condominiumId");
CREATE INDEX IF NOT EXISTS "CondominiumMembership_userId_idx"
    ON "CondominiumMembership"("userId");
ALTER TABLE "CondominiumMembership"
    ADD CONSTRAINT "CondominiumMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CondominiumMembership"
    ADD CONSTRAINT "CondominiumMembership_condominiumId_fkey"
    FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Backfill: 1 membership por usuário com condomínio (papel = papel atual) --
INSERT INTO "CondominiumMembership" ("id", "userId", "condominiumId", "role", "createdAt")
SELECT md5(random()::text || clock_timestamp()::text || "id"),
       "id", "condominiumId", "role", CURRENT_TIMESTAMP
FROM "User"
WHERE "condominiumId" IS NOT NULL
ON CONFLICT ("userId", "condominiumId") DO NOTHING;

-- 5) E-mail como identidade global única -------------------------------------
DROP INDEX IF EXISTS "User_condominiumId_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
