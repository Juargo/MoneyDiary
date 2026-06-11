/*
  Warnings:

  - You are about to drop the `Transaccion` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "IngestaStatus" AS ENUM ('pending', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "MatchType" AS ENUM ('CONTAINS', 'STARTS_WITH', 'REGEX');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('cargo', 'abono');

-- DropTable
DROP TABLE "Transaccion";

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "default_income" DECIMAL(12,2) NOT NULL,
    "needs_percentage" DECIMAL(5,2) DEFAULT 50.00,
    "wants_percentage" DECIMAL(5,2) DEFAULT 30.00,
    "savings_percentage" DECIMAL(5,2) DEFAULT 20.00,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "bank" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "account_number" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestas" (
    "id" BIGSERIAL NOT NULL,
    "account_id" BIGINT,
    "status" "IngestaStatus" NOT NULL,
    "filename" TEXT NOT NULL,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "ingestas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bucket_presupuestos" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "bucket_presupuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrones_clasificacion" (
    "id" BIGSERIAL NOT NULL,
    "bucket_id" BIGINT,
    "expression" TEXT NOT NULL,
    "match_type" "MatchType" NOT NULL,
    "priority" INTEGER NOT NULL,
    "active" BOOLEAN DEFAULT true,
    "created_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrones_clasificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones" (
    "id" BIGSERIAL NOT NULL,
    "ingesta_id" BIGINT,
    "account_id" BIGINT,
    "bucket_id" BIGINT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "TipoTransaccion" NOT NULL,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodos_presupuesto" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "declared_income" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "periodos_presupuesto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumenes_periodo" (
    "id" BIGSERIAL NOT NULL,
    "periodo_id" BIGINT,
    "bucket_id" BIGINT,
    "total_spent" DECIMAL(12,2) NOT NULL,
    "budget_limit" DECIMAL(12,2) NOT NULL,
    "percentage_used" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "resumenes_periodo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "bucket_presupuestos_name_key" ON "bucket_presupuestos"("name");

-- CreateIndex
CREATE INDEX "idx_patrones_bucket_priority" ON "patrones_clasificacion"("bucket_id", "priority");

-- CreateIndex
CREATE INDEX "idx_transacciones_date" ON "transacciones"("date");

-- CreateIndex
CREATE INDEX "idx_transacciones_bucket" ON "transacciones"("bucket_id");

-- CreateIndex
CREATE UNIQUE INDEX "transacciones_date_description_amount_account_id_key" ON "transacciones"("date", "description", "amount", "account_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestas" ADD CONSTRAINT "ingestas_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrones_clasificacion" ADD CONSTRAINT "patrones_clasificacion_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "bucket_presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_ingesta_id_fkey" FOREIGN KEY ("ingesta_id") REFERENCES "ingestas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "bucket_presupuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodos_presupuesto" ADD CONSTRAINT "periodos_presupuesto_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumenes_periodo" ADD CONSTRAINT "resumenes_periodo_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodos_presupuesto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumenes_periodo" ADD CONSTRAINT "resumenes_periodo_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "bucket_presupuestos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
