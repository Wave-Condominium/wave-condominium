-- MOR-023 — Fundo de Reserva via Open Finance (somente leitura)
--
-- Conexão/consentimento (uma por condomínio, autorizada pelo Síndico) e snapshots
-- verificáveis (agregados, com hash ancorado na Stellar). Nenhum dado de
-- transação individual é armazenado (LGPD: coleta mínima).

CREATE TYPE "StatusConexaoOF" AS ENUM ('DESCONECTADO', 'CONECTANDO', 'CONECTADO', 'EXPIRADO', 'REVOGADO', 'ERRO');

CREATE TABLE "FundoReservaConexao" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "status" "StatusConexaoOF" NOT NULL DEFAULT 'DESCONECTADO',
    "agregador" TEXT NOT NULL DEFAULT 'SIMULADO',
    "instituicao" TEXT,
    "externalItemId" TEXT,
    "consentimentoPor" TEXT,
    "consentimentoPorNome" TEXT,
    "consentimentoEm" TIMESTAMP(3),
    "consentimentoExpiraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FundoReservaConexao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FundoReservaConexao_condominiumId_key" ON "FundoReservaConexao"("condominiumId");
ALTER TABLE "FundoReservaConexao"
    ADD CONSTRAINT "FundoReservaConexao_condominiumId_fkey"
    FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FundoReservaSnapshot" (
    "id" TEXT NOT NULL,
    "condominiumId" TEXT NOT NULL,
    "saldoDisponivel" DECIMAL(14,2) NOT NULL,
    "valorInvestido" DECIMAL(14,2) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "origem" TEXT NOT NULL,
    "consultadoEm" TIMESTAMP(3) NOT NULL,
    "hash" TEXT NOT NULL,
    "blockchainTxHash" TEXT,
    "stellarExplorerUrl" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FundoReservaSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FundoReservaSnapshot_condominiumId_consultadoEm_idx" ON "FundoReservaSnapshot"("condominiumId", "consultadoEm");
ALTER TABLE "FundoReservaSnapshot"
    ADD CONSTRAINT "FundoReservaSnapshot_condominiumId_fkey"
    FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE CASCADE ON UPDATE CASCADE;
