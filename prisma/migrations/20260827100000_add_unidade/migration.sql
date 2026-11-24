-- SÍN-021: cadastro e gestão de unidades do condomínio. Tabela nova, escopada
-- por condominiumId, com unicidade (condominiumId, bloco, numero) para impedir
-- duplicidades (inclusive na importação em massa). Aditiva/retrocompatível.

-- CreateEnum
CREATE TYPE "TipoUnidade" AS ENUM ('APARTAMENTO', 'SALA', 'LOJA', 'COBERTURA', 'VAGA_AUTONOMA');

-- CreateEnum
CREATE TYPE "StatusUnidade" AS ENUM ('OCUPADA', 'VAGA', 'EM_OBRA');

-- CreateTable
CREATE TABLE "Unidade" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "bloco" TEXT NOT NULL DEFAULT '',
    "andar" TEXT NOT NULL DEFAULT '',
    "numero" TEXT NOT NULL,
    "tipo" "TipoUnidade" NOT NULL DEFAULT 'APARTAMENTO',
    "fracaoIdeal" DECIMAL(9,6),
    "areaPrivativa" DECIMAL(10,2),
    "vagas" INTEGER NOT NULL DEFAULT 0,
    "status" "StatusUnidade" NOT NULL DEFAULT 'VAGA',
    "proprietarioNome" TEXT,
    "proprietarioEmail" TEXT,
    "proprietarioTelefone" TEXT,
    "inquilinoNome" TEXT,
    "inquilinoEmail" TEXT,
    "inquilinoTelefone" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Unidade_condominiumId_status_idx" ON "Unidade"("condominiumId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Unidade_condominiumId_bloco_numero_key" ON "Unidade"("condominiumId", "bloco", "numero");

-- AddForeignKey
ALTER TABLE "Unidade" ADD CONSTRAINT "Unidade_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
