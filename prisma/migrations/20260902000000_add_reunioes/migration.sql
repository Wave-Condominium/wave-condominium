-- SÍN-026 (reuniões): migração do módulo de Reuniões & Atas para o Postgres
-- (antes em localStorage). Tabelas novas, escopadas por condominiumId. A ata é
-- o registro oficial da reunião com código de integridade (MOR-033); presenças
-- são confirmadas com a identidade da sessão (MOR-032), uma por usuário/reunião.
-- Aditiva/retrocompatível.

-- CreateEnum
CREATE TYPE "StatusReuniao" AS ENUM ('AGENDADA', 'EM_ANDAMENTO', 'CONCLUIDA');

-- CreateTable
CREATE TABLE "Reuniao" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "duracao" INTEGER NOT NULL DEFAULT 120,
    "meetLink" TEXT NOT NULL DEFAULT '',
    "status" "StatusReuniao" NOT NULL DEFAULT 'AGENDADA',
    "maxParticipantes" INTEGER NOT NULL DEFAULT 100,
    "pauta" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ataContent" TEXT,
    "ataHash" TEXT,
    "recordingUrl" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reuniao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfirmacaoPresenca" (
    "id" TEXT NOT NULL,
    "reuniaoId" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT '',
    "confirmadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfirmacaoPresenca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reuniao_condominiumId_status_idx" ON "Reuniao"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "Reuniao_condominiumId_data_idx" ON "Reuniao"("condominiumId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "ConfirmacaoPresenca_reuniaoId_userId_key" ON "ConfirmacaoPresenca"("reuniaoId", "userId");

-- CreateIndex
CREATE INDEX "ConfirmacaoPresenca_reuniaoId_idx" ON "ConfirmacaoPresenca"("reuniaoId");

-- AddForeignKey
ALTER TABLE "Reuniao" ADD CONSTRAINT "Reuniao_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfirmacaoPresenca" ADD CONSTRAINT "ConfirmacaoPresenca_reuniaoId_fkey" FOREIGN KEY ("reuniaoId") REFERENCES "Reuniao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
