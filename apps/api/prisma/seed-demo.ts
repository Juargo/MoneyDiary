import 'dotenv/config';
import { randomBytes, scryptSync } from 'node:crypto';
import { PrismaClient, TipoTransaccion } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Seed de DATOS DEMO para el único usuario del sistema.
 *
 * Genera ingresos y egresos de los 4 bancos soportados (Banco de Chile,
 * BancoEstado, BCI, Santander) para todos los meses entre 2019-01 y 2026-06.
 *
 * La clasificación de cada egreso se calcula corriendo los MISMOS patrones
 * REGEX que viven en la tabla `patrones_clasificacion` (ver prisma/seed.ts).
 * Varias descripciones están pensadas para NO coincidir con ningún patrón,
 * de modo que caen en el bucket `SinCategorizar`. Los abonos (ingresos) van
 * siempre al bucket `Ingresos`.
 *
 * Es idempotente: cada corrida BORRA transacciones, ingestas y cuentas
 * (deja intactos buckets y patrones) y vuelve a generar el set completo con
 * un PRNG semilla fija, por lo que los datos son estables entre corridas.
 *
 * Requiere que prisma/seed.ts ya haya corrido (buckets + patrones).
 *
 *   pnpm api seed       # patrones (correr primero)
 *   pnpm api seed:demo  # estos datos demo
 */

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Falta DATABASE_URL/DIRECT_URL en el entorno.');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

// ---------------------------------------------------------------------------
// Usuario único
// ---------------------------------------------------------------------------
const USER_EMAIL = 'jorgeretamalaburto@gmail.com';
const USER_PASSWORD = 'moneydiary123';
const DEFAULT_INCOME = 1_500_000;

/**
 * Hash auto-descriptivo `scrypt$<saltHex>$<hashHex>` usando el módulo
 * `crypto` de Node (sin dependencias). Aún no hay capa de auth definida en el
 * proyecto, así que `password_hash` es por ahora solo una columna; cuando se
 * implemente auth basta verificar con el mismo esquema scrypt.
 */
function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// ---------------------------------------------------------------------------
// PRNG determinista (mulberry32) — datos estables entre corridas
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260617);
const rnd = (min: number, max: number) => min + rand() * (max - min);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
/** Monto CLP redondeado a la centena, con variación aleatoria. */
const clp = (base: number, jitter = 0.15) =>
  Math.round((base * rnd(1 - jitter, 1 + jitter)) / 100) * 100;

// ---------------------------------------------------------------------------
// Bancos (una cuenta por banco)
// ---------------------------------------------------------------------------
type BankKey = 'chile' | 'estado' | 'bci' | 'santander';
const BANKS: Record<
  BankKey,
  { bank: string; accountType: string; accountNumber: string; filename: string }
> = {
  chile: {
    bank: 'Banco de Chile',
    accountType: 'Cuenta Corriente',
    accountNumber: '00-800-12345-09',
    filename: 'cartola_banco_chile_demo.xlsx',
  },
  estado: {
    bank: 'BancoEstado',
    accountType: 'CuentaRUT',
    accountNumber: '17046102',
    filename: 'Ultimos_Movimientos_CuentaRUT_demo.xlsx',
  },
  bci: {
    bank: 'BCI',
    accountType: 'Cuenta Corriente',
    accountNumber: '89101006',
    filename: 'movimientos_bci_demo.xlsx',
  },
  santander: {
    bank: 'Santander',
    accountType: 'Cuenta Corriente',
    accountNumber: '0-000-7654321-0',
    filename: 'ultimos_movimientos_santander_demo.xlsx',
  },
};

// ---------------------------------------------------------------------------
// Plantillas de transacciones recurrentes por mes
// `bank` define en qué cuenta cae el movimiento.
// ---------------------------------------------------------------------------
type Tpl = {
  bank: BankKey;
  type: TipoTransaccion;
  desc: () => string;
  amount: () => number;
  day: () => number;
  /** Probabilidad de que aparezca este mes (1 = siempre). */
  prob?: number;
  /** Cuántas veces puede repetirse en el mes (default 1). */
  times?: number;
};

const dayMid = () => Math.floor(rnd(8, 20));
const dayAny = () => Math.floor(rnd(2, 27));

const SUPERMERCADOS = ['LIDER', 'JUMBO', 'SANTA ISABEL', 'TOTTUS', 'UNIMARC'];
const RESTAURANTES = [
  'RESTAURANT DON PEDRO',
  'STARBUCKS COSTANERA',
  'CAFE HAITI',
  'MCDONALDS',
  'SUSHI HOUSE',
];
const COMPRAS = ['FALABELLA', 'PARIS', 'RIPLEY', 'MERCADO LIBRE', 'SODIMAC'];

// Egresos / abonos que NO coinciden con ningún patrón -> SinCategorizar.
const SIN_CATEGORIA = [
  'TRANSFERENCIA A TERCEROS',
  'GIRO CAJERO AUTOMATICO REDBANC',
  'PAGO PAT SEGUROS VIDA',
  'CARGO POR MANTENCION CUENTA',
  'COMISION ADMINISTRACION',
  'COMPRA POS COMERCIO 5544',
  'SERVIPAG PAGO SERVICIOS',
  'TRASPASO A CUENTA PROPIA',
  'PAGO TARJETA CREDITO VISA',
  'SUSCRIPCION DIGITAL MENSUAL',
  'RETIRO EFECTIVO SUCURSAL',
  'MERPAGO KIOSCO DIGITAL',
];

/** Sueldo del año (crece ~4% por año hacia 2026 = $1.5M). */
function sueldoDelAnio(year: number): number {
  const factor = 1 - 0.04 * (2026 - year);
  return Math.round((DEFAULT_INCOME * factor) / 1000) * 1000;
}

function plantillas(year: number): Tpl[] {
  return [
    // --- Ingresos (abono -> Ingresos) ---
    {
      bank: 'estado',
      type: TipoTransaccion.abono,
      desc: () => 'SUELDO EMPRESA SPA',
      amount: () => sueldoDelAnio(year),
      day: () => 5,
    },
    {
      // Ingreso esporádico en otros bancos para que los 4 tengan abonos.
      bank: pick(['chile', 'bci', 'santander'] as BankKey[]),
      type: TipoTransaccion.abono,
      desc: () =>
        pick([
          'TRANSFERENCIA RECIBIDA',
          'DEVOLUCION SII',
          'ABONO REEMBOLSO',
          'PAGO FREELANCE',
        ]),
      amount: () => clp(120_000, 0.5),
      day: dayAny,
      prob: 0.6,
    },

    // --- Necesidades ---
    {
      bank: 'chile',
      type: TipoTransaccion.cargo,
      desc: () => 'ARRIENDO DEPARTAMENTO',
      amount: () => clp(450_000, 0.05),
      day: () => 5,
    },
    {
      bank: pick(['estado', 'santander'] as BankKey[]),
      type: TipoTransaccion.cargo,
      desc: () => `${pick(SUPERMERCADOS)} COMPRA`,
      amount: () => clp(45_000, 0.4),
      day: dayAny,
      times: 3,
    },
    {
      bank: 'chile',
      type: TipoTransaccion.cargo,
      desc: () => 'ENEL DISTRIBUCION CUENTA LUZ',
      amount: () => clp(28_000, 0.3),
      day: () => 12,
    },
    {
      bank: 'chile',
      type: TipoTransaccion.cargo,
      desc: () => 'AGUAS ANDINAS BOLETA',
      amount: () => clp(18_000, 0.3),
      day: () => 12,
    },
    {
      bank: 'chile',
      type: TipoTransaccion.cargo,
      desc: () => 'MOVISTAR PLAN HOGAR',
      amount: () => clp(35_000, 0.1),
      day: () => 15,
    },
    {
      bank: 'santander',
      type: TipoTransaccion.cargo,
      desc: () => 'COPEC BENCINA',
      amount: () => clp(30_000, 0.4),
      day: dayAny,
      times: 2,
    },
    {
      bank: 'santander',
      type: TipoTransaccion.cargo,
      desc: () => `FARMACIA ${pick(['CRUZ VERDE', 'SALCOBRAND', 'AHUMADA'])}`,
      amount: () => clp(15_000, 0.6),
      day: dayAny,
      prob: 0.7,
    },

    // --- Gustos ---
    {
      bank: 'bci',
      type: TipoTransaccion.cargo,
      desc: () => 'NETFLIX.COM',
      amount: () => clp(9_900, 0.05),
      day: () => 8,
    },
    {
      bank: 'bci',
      type: TipoTransaccion.cargo,
      desc: () => 'SPOTIFY AB',
      amount: () => clp(5_900, 0.05),
      day: () => 8,
    },
    {
      bank: 'bci',
      type: TipoTransaccion.cargo,
      desc: () => pick(RESTAURANTES),
      amount: () => clp(18_000, 0.5),
      day: dayAny,
      times: 4,
    },
    {
      bank: 'bci',
      type: TipoTransaccion.cargo,
      desc: () => `UBER ${pick(['TRIP', 'VIAJE', '* TRIP HELP'])}`,
      amount: () => clp(6_500, 0.5),
      day: dayAny,
      times: 3,
    },
    {
      bank: 'bci',
      type: TipoTransaccion.cargo,
      desc: () => `${pick(COMPRAS)} COMPRA WEB`,
      amount: () => clp(40_000, 0.7),
      day: dayAny,
      prob: 0.6,
      times: 2,
    },

    // --- Ahorro ---
    {
      bank: 'chile',
      type: TipoTransaccion.cargo,
      desc: () => pick(['FINTUAL APORTE', 'DEPOSITO A PLAZO', 'RACIONAL FONDO']),
      amount: () => clp(100_000, 0.3),
      day: () => 28,
      prob: 0.7,
    },

    // --- Sin categoría (no coinciden con ningún patrón) ---
    {
      bank: pick(['estado', 'santander', 'chile'] as BankKey[]),
      type: TipoTransaccion.cargo,
      desc: () => pick(SIN_CATEGORIA),
      amount: () => clp(25_000, 0.8),
      day: dayAny,
      times: 4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Clasificador: corre los patrones REGEX igual que el pipeline.
// ---------------------------------------------------------------------------
type Patron = { expression: string; bucketId: bigint; priority: number };

function clasificar(
  description: string,
  type: TipoTransaccion,
  patrones: Patron[],
  bucketIds: { ingresos: bigint; sin: bigint },
): bigint {
  if (type === TipoTransaccion.abono) return bucketIds.ingresos;
  for (const p of patrones) {
    try {
      if (new RegExp(p.expression, 'i').test(description)) return p.bucketId;
    } catch {
      /* expresión inválida -> ignorar */
    }
  }
  return bucketIds.sin;
}

// ---------------------------------------------------------------------------
async function main() {
  // 1) Buckets (deben existir vía prisma/seed.ts)
  const buckets = await prisma.bucketPresupuesto.findMany();
  const bucketByName = new Map(buckets.map((b) => [b.name, b.id]));
  const ingresosId = bucketByName.get('Ingresos');
  const sinId = bucketByName.get('SinCategorizar');
  if (!ingresosId || !sinId) {
    throw new Error(
      'Faltan buckets base. Corre `pnpm api seed` antes de `seed:demo`.',
    );
  }

  // 2) Patrones ordenados por prioridad ascendente (igual que el pipeline)
  const patrones: Patron[] = (
    await prisma.patronClasificacion.findMany({
      where: { active: true, bucketId: { not: null } },
      orderBy: { priority: 'asc' },
    })
  ).map((p) => ({
    expression: p.expression,
    bucketId: p.bucketId as bigint,
    priority: p.priority,
  }));

  // 3) Reset idempotente (preserva buckets y patrones)
  await prisma.transaccion.deleteMany({});
  await prisma.ingesta.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });

  // 4) Usuario único
  const user = await prisma.user.create({
    data: {
      email: USER_EMAIL,
      passwordHash: hashPassword(USER_PASSWORD),
      defaultIncome: DEFAULT_INCOME,
    },
  });

  // 5) Una cuenta + una ingesta por banco
  const accountId: Record<BankKey, bigint> = {} as Record<BankKey, bigint>;
  const ingestaId: Record<BankKey, bigint> = {} as Record<BankKey, bigint>;
  for (const key of Object.keys(BANKS) as BankKey[]) {
    const cfg = BANKS[key];
    const acc = await prisma.account.create({
      data: {
        userId: user.id,
        bank: cfg.bank,
        accountType: cfg.accountType,
        accountNumber: cfg.accountNumber,
      },
    });
    const ing = await prisma.ingesta.create({
      data: {
        accountId: acc.id,
        status: 'processed',
        filename: cfg.filename,
        processedAt: new Date(),
      },
    });
    accountId[key] = acc.id;
    ingestaId[key] = ing.id;
  }

  // 6) Generar transacciones mes a mes
  type Row = {
    ingestaId: bigint;
    accountId: bigint;
    bucketId: bigint;
    date: Date;
    description: string;
    amount: number;
    type: TipoTransaccion;
  };
  const rows: Row[] = [];
  // clave única lógica: (date, description, amount, accountId)
  const seen = new Set<string>();

  for (let year = 2019; year <= 2026; year++) {
    const lastMonth = year === 2026 ? 6 : 12; // hoy = 2026-06-17
    for (let month = 1; month <= lastMonth; month++) {
      for (const tpl of plantillas(year)) {
        const times = tpl.times ?? 1;
        for (let i = 0; i < times; i++) {
          if (tpl.prob !== undefined && rand() > tpl.prob) continue;
          const day = Math.min(28, Math.max(1, tpl.day()));
          const description = tpl.desc();
          const amount = tpl.amount();
          const accId = accountId[tpl.bank];
          const key = `${year}-${month}-${day}-${description}-${amount}-${accId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          rows.push({
            ingestaId: ingestaId[tpl.bank],
            accountId: accId,
            bucketId: clasificar(description, tpl.type, patrones, {
              ingresos: ingresosId,
              sin: sinId,
            }),
            date: new Date(Date.UTC(year, month - 1, day)),
            description,
            amount,
            type: tpl.type,
          });
        }
      }
    }
  }

  // 7) Insertar en lotes
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    await prisma.transaccion.createMany({
      data: rows.slice(i, i + BATCH),
      skipDuplicates: true,
    });
  }

  // 8) Resumen
  const porBucket = await prisma.transaccion.groupBy({
    by: ['bucketId'],
    _count: { _all: true },
  });
  const nombre = new Map(buckets.map((b) => [b.id.toString(), b.name]));
  console.log(`Usuario: ${user.email} (id ${user.id})`);
  console.log(`Cuentas: ${Object.keys(BANKS).length} (1 por banco)`);
  console.log(`Transacciones: ${rows.length}`);
  for (const g of porBucket) {
    console.log(
      `  - ${nombre.get(g.bucketId.toString())}: ${g._count._all}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
