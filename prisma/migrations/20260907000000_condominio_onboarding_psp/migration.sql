-- SÍN-030 — Cadastro do condomínio (CNPJ, conta e vínculo ao PSP)
--
-- Adiciona os dados cadastrais/bancários/do responsável, o consentimento de
-- representação e a MÁQUINA DE ESTADOS do vínculo com o PSP. Os CNPJ/subconta
-- (únicos) já vieram no SÍN-031.

-- Enums novos ----------------------------------------------------------------
CREATE TYPE "TipoContaBancaria" AS ENUM ('CORRENTE', 'POUPANCA');
CREATE TYPE "RelacaoResponsavel" AS ENUM ('SINDICO', 'ADMINISTRADORA', 'PROCURADOR');
CREATE TYPE "StatusOnboardingPsp" AS ENUM ('NAO_INICIADO', 'SUBCONTA_CRIANDO', 'KYC_PENDENTE', 'EM_ANALISE', 'APTO', 'RECUSADO');

-- Colunas de onboarding no Condominium ---------------------------------------
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "cep" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "logradouro" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "numero" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "complemento" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "bairro" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "cidade" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "uf" TEXT;

ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "bancoNome" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "bancoAgencia" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "bancoConta" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "bancoTipoConta" "TipoContaBancaria";
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "pixChave" TEXT;

ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "responsavelNome" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "responsavelEmail" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "responsavelTelefone" TEXT;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "responsavelRelacao" "RelacaoResponsavel";

ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "consentimentoRepresentacao" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "consentimentoEm" TIMESTAMP(3);

ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "pspStatus" "StatusOnboardingPsp" NOT NULL DEFAULT 'NAO_INICIADO';
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "pspAtualizadoEm" TIMESTAMP(3);
ALTER TABLE "Condominium" ADD COLUMN IF NOT EXISTS "pspMotivoRecusa" TEXT;

-- Grandfathering: condomínios que já operam na plataforma são considerados APTO
-- (não podem ser bloqueados por um onboarding que nasceu depois deles).
UPDATE "Condominium" SET "pspStatus" = 'APTO' WHERE "pspStatus" = 'NAO_INICIADO';
