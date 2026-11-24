-- SÍN-005: rejeição de proposta pelo síndico preservando rastreabilidade.
-- Campos aditivos e nullable (retrocompatível). Nenhum dado é excluído.
-- AlterTable
ALTER TABLE "Proposta" ADD COLUMN "motivoRejeicao" TEXT;
ALTER TABLE "Proposta" ADD COLUMN "rejeitadaPor" TEXT;
ALTER TABLE "Proposta" ADD COLUMN "rejeitadaPorId" TEXT;
ALTER TABLE "Proposta" ADD COLUMN "rejeitadaEm" TIMESTAMP(3);
