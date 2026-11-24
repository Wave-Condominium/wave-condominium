-- SÍN-026 (manutenção): a solicitação de serviço do morador passa a depender da
-- decisão do síndico. Novos status (aguardando aprovação / recusada) e campos da
-- solicitação + rastreabilidade da decisão. Aditiva/retrocompatível.

-- AlterEnum: novos status de ocorrência.
ALTER TYPE "StatusOcorrencia" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';
ALTER TYPE "StatusOcorrencia" ADD VALUE IF NOT EXISTS 'RECUSADA';

-- AlterTable: dados da solicitação + decisão.
ALTER TABLE "SolicitacaoServico" ADD COLUMN "titulo" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "prioridade" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "solicitanteId" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "solicitante" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "motivoRecusa" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "decididoPor" TEXT;
ALTER TABLE "SolicitacaoServico" ADD COLUMN "decididoEm" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SolicitacaoServico_condominiumId_status_idx" ON "SolicitacaoServico"("condominiumId", "status");
