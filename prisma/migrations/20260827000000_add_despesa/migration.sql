-- SÍN-011: Tesouraria — registro de despesas/pagamentos com comprovante e
-- integridade (âncora Stellar). Tabela nova, escopada por condominiumId.
-- Aditiva e retrocompatível (não altera tabelas existentes).

-- CreateEnum
CREATE TYPE "CategoriaDespesa" AS ENUM ('FOLHA_PAGAMENTO', 'JARDINAGEM', 'LIMPEZA', 'MANUTENCAO_PREDIAL', 'ELEVADORES', 'SEGURANCA_PORTARIA', 'AGUA_ESGOTO', 'ENERGIA', 'GAS', 'SEGUROS', 'TAXAS_TRIBUTOS', 'ADMINISTRACAO', 'OBRAS_BENFEITORIAS', 'OUTROS');

-- CreateEnum
CREATE TYPE "StatusDespesa" AS ENUM ('PENDENTE', 'PAGO');

-- CreateEnum
CREATE TYPE "FormaPagamentoDespesa" AS ENUM ('PIX', 'TED', 'TRANSFERENCIA', 'DINHEIRO', 'BOLETO', 'CARTAO', 'DEBITO_AUTOMATICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "OrigemRecursoDespesa" AS ENUM ('SALDO', 'FUNDO_RESERVA');

-- CreateTable
CREATE TABLE "Despesa" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "categoria" "CategoriaDespesa" NOT NULL,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "dataVencimento" TEXT NOT NULL,
    "dataPagamento" TEXT,
    "formaPagamento" "FormaPagamentoDespesa",
    "origemRecurso" "OrigemRecursoDespesa" NOT NULL DEFAULT 'SALDO',
    "status" "StatusDespesa" NOT NULL DEFAULT 'PENDENTE',
    "comprovanteNome" TEXT,
    "comprovanteUrl" TEXT,
    "comprovanteMime" TEXT,
    "comprovanteTamanho" INTEGER,
    "comprovanteHash" TEXT,
    "blockchainTxHash" TEXT,
    "blockchainRegisteredAt" TIMESTAMP(3),
    "stellarExplorerUrl" TEXT,
    "registradoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Despesa_condominiumId_status_idx" ON "Despesa"("condominiumId", "status");

-- CreateIndex
CREATE INDEX "Despesa_condominiumId_categoria_idx" ON "Despesa"("condominiumId", "categoria");

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
