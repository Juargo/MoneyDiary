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

// Cada patrón = una "marca/categoría" globalmente conocida.
// expression con sintaxis regex (matchType = REGEX) para preservar el
// comportamiento del antiguo DefaultCategoryRuleProvider.
// El orden importa: las prioridades más bajas se evalúan primero.
const seedPatrones: Array<{
  bucket: 'Necesidades' | 'Gustos' | 'Ahorro';
  label: string;
  icon: string | null;
  expression: string;
  priority: number;
}> = [
  // Delivery primero para que "uber eats" no caiga en Transporte
  {
    bucket: 'Gustos',
    label: 'Delivery',
    icon: null,
    expression: 'uber eats|pedidos ya|rappi|cornershop|justo|delivery',
    priority: 10,
  },
  {
    bucket: 'Gustos',
    label: 'Restaurantes',
    icon: null,
    expression:
      'restaurant|starbucks|cafe|mcdonald|burger|kfc|subway|domino|telepizza|sushi',
    priority: 20,
  },
  {
    bucket: 'Necesidades',
    label: 'Alimentación',
    icon: null,
    expression:
      'lider|jumbo|santa isabel|tottus|unimarc|ekono|acuenta|supermercado',
    priority: 30,
  },
  {
    bucket: 'Necesidades',
    label: 'Vivienda',
    icon: null,
    expression: 'arriendo|inmobiliaria|hipotec|condominio|gastos? comunes',
    priority: 40,
  },
  {
    bucket: 'Necesidades',
    label: 'Cuentas',
    icon: null,
    expression:
      'enel|chilectra|aguas|esval|metrogas|lipigas|abastible|movistar|entel|wom|claro|vtr|gtd|directv',
    priority: 50,
  },
  {
    bucket: 'Necesidades',
    label: 'Transporte',
    icon: null,
    expression:
      'uber\\b|cabify|didi|metro\\b|bencina|copec|shell|petrobras|enex|tag|autopista|bip',
    priority: 60,
  },
  {
    bucket: 'Necesidades',
    label: 'Salud',
    icon: null,
    expression:
      'farmacia|cruz verde|salcobrand|ahumada|clinica|hospital|isapre|fonasa|laboratorio',
    priority: 70,
  },
  {
    bucket: 'Gustos',
    label: 'Ocio',
    icon: null,
    expression:
      'netflix|spotify|hbo|disney\\+?|prime video|youtube|cinemark|hoyts|cinepolis|steam|playstation|xbox',
    priority: 80,
  },
  {
    bucket: 'Gustos',
    label: 'Compras',
    icon: null,
    expression:
      'falabella|paris|ripley|la polar|hites|abcdin|mercado libre|amazon|aliexpress|sodimac|easy',
    priority: 90,
  },
  {
    bucket: 'Ahorro',
    label: 'Ahorro',
    icon: null,
    expression: 'fintual|racional|fondo mutuo|deposito a plazo|inversiones',
    priority: 100,
  },
];

async function main() {
  for (const name of ['SinCategorizar', 'Necesidades', 'Gustos', 'Ahorro', 'Ingresos']) {
    await prisma.bucketPresupuesto.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  for (const seed of seedPatrones) {
    const bucket = await prisma.bucketPresupuesto.findUnique({
      where: { name: seed.bucket },
    });
    if (!bucket) continue;

    // Idempotencia: identificamos un patrón por (bucketId, expression).
    const existing = await prisma.patronClasificacion.findFirst({
      where: { bucketId: bucket.id, expression: seed.expression },
    });
    if (existing) {
      await prisma.patronClasificacion.update({
        where: { id: existing.id },
        data: {
          label: seed.label,
          icon: seed.icon,
          matchType: MatchType.REGEX,
          priority: seed.priority,
          active: true,
        },
      });
    } else {
      await prisma.patronClasificacion.create({
        data: {
          bucketId: bucket.id,
          label: seed.label,
          icon: seed.icon,
          expression: seed.expression,
          matchType: MatchType.REGEX,
          priority: seed.priority,
          active: true,
        },
      });
    }
  }

  console.log(`Seed completo: ${seedPatrones.length} patrones.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
