-- SÍN-022: geração de credenciais para moradores. O Síndico gera um convite de
-- acesso a partir de uma unidade; o morador define a própria senha na ativação.
--
-- Segurança: guardamos apenas o SHA-256 do token de ativação ("tokenHash"),
-- nunca o token em claro. O link tem expiração ("expiresAt") e uso único.
-- Revogar bloqueia o acesso do usuário ("User"."acessoRevogado") e invalida o
-- convite. Aditiva/retrocompatível (colunas/tabelas novas; DEFAULTs seguros).

-- AlterTable: bloqueio de acesso por revogação (verificado em login/guard).
ALTER TABLE "User" ADD COLUMN "acessoRevogado" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "VinculoMorador" AS ENUM ('PROPRIETARIO', 'INQUILINO', 'DEPENDENTE');

-- CreateEnum
CREATE TYPE "StatusConvite" AS ENUM ('PENDENTE', 'ATIVADO', 'REVOGADO');

-- CreateTable
CREATE TABLE "ConviteAcesso" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "unidadeId" TEXT,
    "unidadeRotulo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "vinculo" "VinculoMorador" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "StatusConvite" NOT NULL DEFAULT 'PENDENTE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usuarioId" TEXT,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),
    "revogadoPor" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConviteAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConviteAcesso_tokenHash_key" ON "ConviteAcesso"("tokenHash");

-- CreateIndex
CREATE INDEX "ConviteAcesso_condominiumId_status_idx" ON "ConviteAcesso"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "ConviteAcesso_condominiumId_unidadeId_idx" ON "ConviteAcesso"("condominiumId", "unidadeId");

-- CreateIndex
CREATE INDEX "ConviteAcesso_email_idx" ON "ConviteAcesso"("email");

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConviteAcesso" ADD CONSTRAINT "ConviteAcesso_unidadeId_fkey" FOREIGN KEY ("unidadeId") REFERENCES "Unidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
