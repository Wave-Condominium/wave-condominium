-- SÍN-026 (financeiro): alçada de aprovação. Despesas acima do teto configurado
-- por condomínio passam a exigir aprovação do síndico na Central de Aprovações.
-- Aditiva/retrocompatível: coluna de alçada é NULL (sem alçada = comportamento
-- anterior), e os novos status/colunas não afetam as despesas existentes.

-- AlterEnum: novos status de despesa (acima da alçada / reprovada).
ALTER TYPE "StatusDespesa" ADD VALUE IF NOT EXISTS 'AGUARDANDO_APROVACAO';
ALTER TYPE "StatusDespesa" ADD VALUE IF NOT EXISTS 'REPROVADA';

-- AlterTable: teto de alçada por condomínio (NULL = sem alçada).
ALTER TABLE "Condominium" ADD COLUMN "alcadaAprovacao" DECIMAL(12,2);

-- AlterTable: rastreabilidade da decisão sobre a despesa.
ALTER TABLE "Despesa" ADD COLUMN "aprovadaPor" TEXT;
ALTER TABLE "Despesa" ADD COLUMN "aprovadaEm" TIMESTAMP(3);
ALTER TABLE "Despesa" ADD COLUMN "reprovadaPor" TEXT;
ALTER TABLE "Despesa" ADD COLUMN "reprovadaEm" TIMESTAMP(3);
ALTER TABLE "Despesa" ADD COLUMN "motivoReprovacao" TEXT;
