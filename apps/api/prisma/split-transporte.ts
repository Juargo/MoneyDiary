import 'dotenv/config';
import { MatchType, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL/DIRECT_URL en el entorno.');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const OLD_EXPRESSION =
  'uber\\b|cabify|didi|metro\\b|bencina|copec|shell|petrobras|enex|tag|autopista|bip';
const NEW_NECESIDAD_EXPRESSION =
  'metro\\b|bencina|copec|shell|petrobras|enex|tag|autopista|bip';
const APPS_TRANSPORTE_EXPRESSION = 'uber\\b|cabify|didi';

async function main() {
  const necesidades = await prisma.bucketPresupuesto.findUnique({
    where: { name: 'Necesidades' },
  });
  const gustos = await prisma.bucketPresupuesto.findUnique({
    where: { name: 'Gustos' },
  });
  if (!necesidades || !gustos) {
    throw new Error('Faltan los buckets Necesidades/Gustos. Corre `pnpm api seed` primero.');
  }

  const existing = await prisma.patronClasificacion.findFirst({
    where: { bucketId: necesidades.id, expression: OLD_EXPRESSION },
  });

  if (existing) {
    await prisma.patronClasificacion.update({
      where: { id: existing.id },
      data: {
        expression: NEW_NECESIDAD_EXPRESSION,
        label: 'Transporte',
        icon: 'Bus',
      },
    });
    console.log('✔ Transporte (Necesidad) actualizado sin uber/cabify/didi.');
  } else {
    console.log('ℹ No encontré el patrón original — quizá ya fue editado a mano.');
  }

  const yaExiste = await prisma.patronClasificacion.findFirst({
    where: { bucketId: gustos.id, expression: APPS_TRANSPORTE_EXPRESSION },
  });

  if (yaExiste) {
    console.log('ℹ "Apps de transporte" (Gustos) ya existía, no lo duplico.');
  } else {
    await prisma.patronClasificacion.create({
      data: {
        bucketId: gustos.id,
        label: 'Apps de transporte',
        icon: 'Car',
        expression: APPS_TRANSPORTE_EXPRESSION,
        matchType: MatchType.REGEX,
        // Prioridad menor que Transporte (60) para que matchee primero.
        priority: 55,
        active: true,
      },
    });
    console.log('✔ "Apps de transporte" (Gustos) creado con prioridad 55.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
