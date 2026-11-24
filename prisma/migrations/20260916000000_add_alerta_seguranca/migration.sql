-- CreateEnum
CREATE TYPE "TipoAlertaSeguranca" AS ENUM ('MULTIPLAS_FALHAS_LOGIN_MESMA_CONTA', 'MULTIPLOS_LOGINS_MESMO_IP', 'MUITOS_ACESSOS_NEGADOS');

-- CreateTable
CREATE TABLE "AlertaSeguranca" (
    "id" TEXT NOT NULL,
    "tipo" "TipoAlertaSeguranca" NOT NULL,
    "descricao" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "email" TEXT,
    "condominiumId" TEXT,
    "ip" TEXT,
    "resolvidoEm" TIMESTAMP(3),
    "resolvidoPorId" TEXT,

    CONSTRAINT "AlertaSeguranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlertaSeguranca_tipo_createdAt_idx" ON "AlertaSeguranca"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "AlertaSeguranca_condominiumId_resolvidoEm_idx" ON "AlertaSeguranca"("condominiumId", "resolvidoEm");

-- CreateIndex
CREATE INDEX "AlertaSeguranca_email_idx" ON "AlertaSeguranca"("email");

-- AddForeignKey
ALTER TABLE "AlertaSeguranca" ADD CONSTRAINT "AlertaSeguranca_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaSeguranca" ADD CONSTRAINT "AlertaSeguranca_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertaSeguranca" ADD CONSTRAINT "AlertaSeguranca_resolvidoPorId_fkey" FOREIGN KEY ("resolvidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
