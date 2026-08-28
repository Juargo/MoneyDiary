/**
 * e2e/fixtures/preview-stress-fixture.ts — a realistic-scale
 * `POST /api/ingestas/preview` response for `preview-stress.e2e.ts`
 * (Impeccable critique P3: the unpaginated review table was "never
 * stress-tested at real scale"). The repo's real `.xlsx` fixtures top out at
 * ~30 rows; a real Chilean cartola runs 100-300 movements/month, so this
 * generator produces a 300-row response instead of reusing the small
 * fixtures under `apps/api/test/fixtures/`.
 *
 * Wire shape is a literal `PreviewIngestaResponse` instance (verified
 * against `apps/api/openapi.json` and the client-side guards in
 * `src/api/client.ts` — `esPreviewFilaDto`/`esResumenPreviewDto`), NOT an
 * import from `@/api/types`: `tsconfig.e2e.json` has no `@/*` path alias
 * (only `e2e/**` + `playwright.config.ts` are included), and
 * `e2e/fixtures/api-stubs.ts` already established the convention of
 * hand-written literal DTO shapes in this directory rather than importing
 * app-side types.
 *
 * Classification uses the SAME two categories `api-stubs.ts`'s
 * `CATALOGO_FIXTURE` already exposes via the stubbed `GET /api/categorias`
 * (`cat-1` Supermercado/Necesidades, `cat-2` Streaming/Deseos) — reusing it
 * keeps this stress fixture consistent with the catalog the review table's
 * cascading selects actually render against, instead of inventing a second,
 * divergent catalog.
 */

const MERCHANTS = [
  'LIDER SUPERMERCADO',
  'JUMBO CENCOSUD',
  'SANTA ISABEL',
  'UBER * TRIP',
  'UBER EATS',
  'COPEC ESTACION',
  'SHELL ANDES',
  'NETFLIX.COM',
  'SPOTIFY AB',
  'FALABELLA RETAIL',
  'STARBUCKS COFFEE',
  'FARMACIAS AHUMADA',
  'CRUZ VERDE',
  'SODIMAC HOMECENTER',
  'EASY CONSTRUCCION',
  'MCDONALDS CHILE',
  'MOVISTAR CHILE',
  'ENTEL PCS',
  'ENEL DISTRIBUCION',
  'AGUAS ANDINAS',
  'METRO DE SANTIAGO',
  'RED BUS METROPOLITANO',
  'RAPPI CHILE',
  'PEDIDOSYA',
  'MERCADO PAGO',
  'TRANSFERENCIA RECIBIDA',
  'GIRO CAJERO AUTOMATICO',
  'PAGO TARJETA CREDITO',
  'CINE HOYTS',
  'PARIS RETAIL',
  'RIPLEY TIENDAS',
  'ACHS SEGURO',
  'ISAPRE CONSALUD',
  'CLINICA LAS CONDES',
  'AMAZON PRIME',
  'GOOGLE *SERVICES',
  'APPLE.COM/BILL',
] as const;

interface PreviewStressFilaSugerido {
  readonly bucket: string;
  readonly categoriaId: string | null;
}

export interface PreviewStressFila {
  readonly rowIndex: number;
  readonly fecha: string;
  readonly descripcion: string;
  readonly cargo: string;
  readonly abono: string;
  readonly esDuplicado: boolean;
  readonly sugerido: PreviewStressFilaSugerido | null;
}

export interface PreviewStressFixture {
  readonly banco: string;
  readonly tipoCuenta: string;
  readonly numeroCuenta: string;
  readonly estructura: { readonly totalFilasDatos: number };
  readonly muestra: readonly [];
  readonly filas: readonly PreviewStressFila[];
  readonly resumen: {
    readonly totalFilas: number;
    readonly duplicadosDetectados: number;
    readonly nuevas: number;
  };
}

export interface PreviewStressMeta {
  readonly rowCount: number;
  readonly duplicateCount: number;
  readonly classifiedCount: number;
  readonly unclassifiedCount: number;
  /** rowIndex forced non-duplicate + unclassified — the target for the
   * per-row category-select interaction measurement (mid-list, ~row 150). */
  readonly midRowIndex: number;
}

// cat-1/cat-2 mirror api-stubs.ts's CATALOGO_FIXTURE verbatim.
const CATEGORIA_SUPERMERCADO = { bucket: 'Necesidades', categoriaId: 'cat-1' };
const CATEGORIA_STREAMING = { bucket: 'Deseos', categoriaId: 'cat-2' };

// Deterministic amount generator — no real randomness needed, just
// varied-looking CLP integers (1000-89999) so rows don't render identically.
function montoFor(i: number): number {
  return ((i * 37 + 991) % 89000) + 1000;
}

export function buildPreviewStressFixture(rowCount: number): {
  readonly fixture: PreviewStressFixture;
  readonly meta: PreviewStressMeta;
} {
  const midRowIndex = Math.floor(rowCount / 2);
  const filas: PreviewStressFila[] = [];

  for (let i = 0; i < rowCount; i++) {
    // ~14/300 rows are duplicates (every 21st, 1-indexed) — realistic
    // low-but-nonzero duplicate rate for a re-imported cartola tail.
    const esDuplicado = i > 0 && i % 21 === 0;
    // ~1/3 of non-duplicate rows arrive pre-classified (i % 3 === 0),
    // alternating between the two catalog categories — leaves "Solo sin
    // clasificar" real work to do (the other ~2/3) without being all-or-
    // nothing.
    const seClasificaPorFormula = !esDuplicado && i % 3 === 0;
    // ~1/23 unclassified rows are income (nómina/transferencia-shaped) —
    // the catalog's two categories are both expense buckets, so income rows
    // stay unclassified by construction, matching real-world cartola data.
    const esIngreso = !seClasificaPorFormula && i % 23 === 0;

    const merchant = esIngreso
      ? 'TRANSFERENCIA RECIBIDA'
      : MERCHANTS[i % MERCHANTS.length];

    const monto = String(montoFor(i));
    const day = Math.min(30, Math.floor(i / 10) + 1);
    const hour = String(8 + (i % 12)).padStart(2, '0');
    const fecha = `2026-07-${String(day).padStart(2, '0')}T${hour}:00:00.000Z`;

    let sugerido: PreviewStressFilaSugerido | null = seClasificaPorFormula
      ? i % 6 === 0
        ? CATEGORIA_SUPERMERCADO
        : CATEGORIA_STREAMING
      : null;

    // Force the mid-list row to a known, deterministic state (non-
    // duplicate, unclassified) so the per-row interaction measurement has a
    // stable starting point regardless of the formulas above.
    const filaEsDuplicado = i === midRowIndex ? false : esDuplicado;
    if (i === midRowIndex) {
      sugerido = null;
    }

    filas.push({
      rowIndex: i,
      fecha,
      descripcion: merchant,
      cargo: filaEsDuplicado ? monto : esIngreso ? '0' : monto,
      abono: filaEsDuplicado ? '0' : esIngreso ? monto : '0',
      esDuplicado: filaEsDuplicado,
      sugerido: filaEsDuplicado ? null : sugerido,
    });
  }

  const duplicateCount = filas.filter((f) => f.esDuplicado).length;
  const classifiedCount = filas.filter(
    (f) => !f.esDuplicado && f.sugerido !== null,
  ).length;
  const unclassifiedCount = filas.filter(
    (f) => !f.esDuplicado && f.sugerido === null,
  ).length;

  const fixture: PreviewStressFixture = {
    banco: 'Banco de Chile',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '00-123-45678-90',
    estructura: { totalFilasDatos: rowCount },
    muestra: [],
    filas,
    resumen: {
      totalFilas: rowCount,
      duplicadosDetectados: duplicateCount,
      nuevas: rowCount - duplicateCount,
    },
  };

  return {
    fixture,
    meta: {
      rowCount,
      duplicateCount,
      classifiedCount,
      unclassifiedCount,
      midRowIndex,
    },
  };
}
