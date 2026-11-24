-- MOR-057 — Receitas (cota condominial) originadas da confirmação do PSP/Gateway
--
-- A receita nasce do webhook de confirmação do PSP (unidade, valor, data) após a
-- baixa automática. Open Finance NÃO é fonte (só reconciliação, MOR-023).

CREATE TYPE "StatusContabilizacao" AS ENUM ('CONTABILIZADA', 'PENDENTE_CONCILIACAO', 'DIVERGENTE');
CREATE TYPE "OrigemReceita" AS ENUM ('PSP_WEBHOOK');

-- Rastreabilidade da baixa no boleto (cota).
ALTER TABLE "Boleto" ADD COLUMN IF NOT EXISTS "pspReferencia" TEXT;

CREATE TABLE "Receita" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "boletoId" TEXT,
    "unitNumber" TEXT NOT NULL,
    "unitOwner" TEXT NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "status" "StatusContabilizacao" NOT NULL DEFAULT 'CONTABILIZADA',
    "origem" "OrigemReceita" NOT NULL DEFAULT 'PSP_WEBHOOK',
    "pspReferencia" TEXT,
    "divergenciaMotivo" TEXT,
    "contabilizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Receita_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Receita_boletoId_key" ON "Receita"("boletoId");
CREATE INDEX "Receita_condominiumId_unitNumber_idx" ON "Receita"("condominiumId", "unitNumber");
CREATE INDEX "Receita_condominiumId_referenceMonth_idx" ON "Receita"("condominiumId", "referenceMonth");
ALTER TABLE "Receita"
    ADD CONSTRAINT "Receita_condominiumId_fkey"
    FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Receita"
    ADD CONSTRAINT "Receita_boletoId_fkey"
    FOREIGN KEY ("boletoId") REFERENCES "Boleto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
