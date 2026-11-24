-- SÍN-009: gestão de cobrança pelo síndico (lembretes + acordo de parcelamento).
-- Campos aditivos e nullable (retrocompatível). O síndico não paga boletos.
-- AlterTable
ALTER TABLE "Boleto" ADD COLUMN "lastReminderAt" TIMESTAMP(3);
ALTER TABLE "Boleto" ADD COLUMN "acordoParcelas" INTEGER;
ALTER TABLE "Boleto" ADD COLUMN "acordoPrimeiraParcela" TEXT;
ALTER TABLE "Boleto" ADD COLUMN "acordoObservacao" TEXT;
ALTER TABLE "Boleto" ADD COLUMN "acordoRegistradoEm" TIMESTAMP(3);
ALTER TABLE "Boleto" ADD COLUMN "acordoRegistradoPor" TEXT;
