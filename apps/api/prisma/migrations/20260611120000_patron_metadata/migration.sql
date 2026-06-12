-- AlterTable: agrega label e icon (URL) a patrones_clasificacion
ALTER TABLE "patrones_clasificacion" ADD COLUMN "label" TEXT;
ALTER TABLE "patrones_clasificacion" ADD COLUMN "icon" TEXT;
