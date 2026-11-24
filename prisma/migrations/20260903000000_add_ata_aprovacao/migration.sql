-- SÍN-026 (reuniões, Etapa B): ciclo de aprovação da ata. A ata passa a ser
-- redigida como rascunho, enviada para aprovação e só vira OFICIAL quando o
-- síndico aprova na Central. Aditiva/retrocompatível.

-- CreateEnum
CREATE TYPE "StatusAta" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'OFICIAL');

-- AlterTable: ciclo de aprovação + rastreabilidade da decisão sobre a ata.
ALTER TABLE "Reuniao" ADD COLUMN "ataStatus" "StatusAta";
ALTER TABLE "Reuniao" ADD COLUMN "ataAprovadaPor" TEXT;
ALTER TABLE "Reuniao" ADD COLUMN "ataAprovadaEm" TIMESTAMP(3);
ALTER TABLE "Reuniao" ADD COLUMN "ataMotivoRejeicao" TEXT;

-- Atas já existentes (registradas antes da Etapa B) são consideradas OFICIAIS,
-- preservando o histórico e a consulta em "Atas Anteriores".
UPDATE "Reuniao" SET "ataStatus" = 'OFICIAL' WHERE "ataContent" IS NOT NULL;
