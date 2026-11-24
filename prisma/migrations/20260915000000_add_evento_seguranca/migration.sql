-- CreateEnum
CREATE TYPE "TipoEventoSeguranca" AS ENUM ('LOGIN_SUCESSO', 'LOGIN_FALHA', 'LOGOUT', 'ACESSO_NEGADO', 'SENHA_ALTERADA', 'ACESSO_REVOGADO', 'ACESSO_RESTAURADO');

-- CreateEnum
CREATE TYPE "ResultadoEventoSeguranca" AS ENUM ('SUCESSO', 'FALHA');

-- CreateTable
CREATE TABLE "EventoSeguranca" (
    "id" TEXT NOT NULL,
    "tipo" "TipoEventoSeguranca" NOT NULL,
    "resultado" "ResultadoEventoSeguranca" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "email" TEXT,
    "condominiumId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "recurso" TEXT,
    "metadata" JSONB,

    CONSTRAINT "EventoSeguranca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventoSeguranca_tipo_timestamp_idx" ON "EventoSeguranca"("tipo", "timestamp");

-- CreateIndex
CREATE INDEX "EventoSeguranca_userId_idx" ON "EventoSeguranca"("userId");

-- CreateIndex
CREATE INDEX "EventoSeguranca_condominiumId_timestamp_idx" ON "EventoSeguranca"("condominiumId", "timestamp");

-- AddForeignKey
ALTER TABLE "EventoSeguranca" ADD CONSTRAINT "EventoSeguranca_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoSeguranca" ADD CONSTRAINT "EventoSeguranca_condominiumId_fkey" FOREIGN KEY ("condominiumId") REFERENCES "Condominium"("id") ON DELETE SET NULL ON UPDATE CASCADE;
