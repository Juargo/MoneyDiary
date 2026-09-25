import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/crear-categoria-preview.e2e.ts — the full loop of the change
 * `crear-categoria-desde-preview` (WEB-PRV-12..17), end to end and against
 * stubs only: create a categoría with a patrón from one row of the upload
 * preview, and watch the OTHER matching rows pick up the new suggestion
 * without leaving the flow.
 *
 * Stub-everything doctrine (D-11, `fixtures/api-stubs.ts` docblock): no real
 * backend, ever. The second `POST /api/ingestas/preview` deliberately returns
 * a DIFFERENT body from the first — that is exactly what the real backend
 * does once the new patrón exists, and it is what makes the re-run
 * observable. The web never matches patterns itself (ADR-024); this spec
 * would fail if it ever started to, because the stub is the only thing that
 * decides which rows change.
 *
 * Scoped to `movil` + `escritorio` (skips `tablet`) for the same reason
 * `preview-stress.e2e.ts` documents: the review table has no tablet-specific
 * CSS branch.
 */

const FECHA = '2026-07-01T00:00:00.000Z';

// preview-acordeon-bucket T1 / issue #778: the backend never sends
// `sugerido: null` (every non-Ingreso row gets at least its bucket's
// "Desconocido" fallback category before the pattern for "PETSHOP" exists —
// `apps/api` `preview-ingesta.use-case.ts` step 4). `cat-des-1` ("Delivery",
// Deseos) is this spec's own stubbed catalog entry (registered below), so
// every row defaults to it unless overridden — a realistic "not yet matched
// by the new pattern" shape instead of the dead `null`.
const SUGERIDO_SIN_MATCH = { bucket: 'Deseos', categoriaId: 'cat-des-1' };

// Row 0 opens the form. Row 1 is a duplicate that ALSO matches the new
// patrón — it must never be counted nor classified. Row 2 carries a manual
// override applied before creating, and must keep it. Rows 3 and 4 are the
// two candidates whose suggestion flips. Row 5 never matches.
function fila(
  rowIndex: number,
  descripcion: string,
  opciones: {
    esDuplicado?: boolean;
    sugerido?: { bucket: string; categoriaId: string } | null;
  } = {},
) {
  return {
    rowIndex,
    fecha: FECHA,
    descripcion,
    cargo: '10000',
    abono: '0',
    esDuplicado: opciones.esDuplicado ?? false,
    sugerido: opciones.sugerido ?? SUGERIDO_SIN_MATCH,
  };
}

const FILAS_INICIALES = [
  fila(0, 'PETSHOP HUELLITAS'),
  fila(1, 'PETSHOP HUELLITAS', { esDuplicado: true }),
  fila(2, 'PETSHOP CENTRAL'),
  fila(3, 'PETSHOP NORTE'),
  fila(4, 'PETSHOP SUR'),
  fila(5, 'PANADERIA LA ESPIGA'),
];

// After the patrón "PETSHOP" exists, the backend suggests the new categoría
// for every non-duplicate row whose description contains it.
const FILAS_REEVALUADAS = FILAS_INICIALES.map((f) =>
  f.descripcion.includes('PETSHOP')
    ? { ...f, sugerido: { bucket: 'Deseos', categoriaId: 'cat-nueva' } }
    : f,
);

function preview(filas: typeof FILAS_INICIALES) {
  return {
    banco: 'Banco de Chile',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '00-123-45678-90',
    estructura: { totalFilasDatos: filas.length },
    muestra: [],
    filas,
    resumen: {
      totalFilas: filas.length,
      duplicadosDetectados: filas.filter((f) => f.esDuplicado).length,
      nuevas: filas.filter((f) => !f.esDuplicado).length,
    },
  };
}

const CATEGORIA_CREADA = {
  id: 'cat-nueva',
  nombre: 'Mascotas',
  bucket: 'Deseos',
  transaccionesCount: 0,
  patrones: [
    {
      id: 'pat-nuevo',
      categoriaId: 'cat-nueva',
      patron: 'PETSHOP HUELLITAS',
      matchType: 'CONTAINS',
      prioridad: 100,
    },
  ],
};

test.describe('crear una categoría desde la vista previa', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'La tabla de revisión no tiene rama de CSS propia para tablet (ver preview-stress.e2e.ts).',
    );
    await stubApi(page);

    let creada = false;
    // Registered AFTER `stubApi`, so this takes precedence: GET keeps serving
    // the catalog (with the new categoría once it exists, like a refetch
    // would), POST answers the atomic create with its 201 body.
    await page.route('**/api/categorias', async (route) => {
      if (route.request().method() === 'POST') {
        creada = true;
        await route.fulfill({ status: 201, json: CATEGORIA_CREADA });
        return;
      }
      await route.fulfill({
        json: {
          categorias: [
            {
              id: 'cat-des-1',
              nombre: 'Delivery',
              bucket: 'Deseos',
              transaccionesCount: 0,
              patrones: [],
            },
            ...(creada ? [CATEGORIA_CREADA] : []),
          ],
        },
      });
    });

    let llamadasPreview = 0;
    await page.route('**/api/ingestas/preview', async (route) => {
      llamadasPreview += 1;
      await route.fulfill({
        json: preview(
          llamadasPreview === 1 ? FILAS_INICIALES : FILAS_REEVALUADAS,
        ),
      });
    });
  });

  test('la categoría nueva se aplica al resto de las filas que coinciden, sin tocar las editadas a mano', async ({
    page,
  }) => {
    await page.goto('/subir');
    await page.locator('#cartola-file').setInputFiles({
      name: 'cartola.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('stub'),
    });
    // cartola-preview-confirmacion PR10 (D-07, WEB-PRV-19): "Revisar y
    // editar" is now the only path into the editable table.
    await page.getByRole('button', { name: 'Revisar y editar' }).click();
    // preview-acordeon-bucket T1: both accordion levels start COLLAPSED.
    // Every row above defaults to Gustos/Delivery (`SUGERIDO_SIN_MATCH`), so
    // opening that one bucket/categoría reaches all six.
    await page.getByRole('button', { name: /^Gustos ·/ }).click();
    await page.getByRole('button', { name: /^Delivery ·/ }).click();
    await expect(page.getByLabel('Fila 1: grupo')).toBeVisible();

    // Manual override on row 2 (fila 3) BEFORE creating: it must survive the
    // re-run even though its suggestion also changes.
    // El control de bucket es un `<select>`: `selectOption` con el VALOR de
    // dominio ('Deseos'), no un click sobre el texto de despliegue
    // ('Gustos'). Un `<option>` nunca es clickeable en Playwright.
    await page.getByLabel('Fila 3: grupo').selectOption('Deseos');
    await page.getByLabel('Fila 3: categoría').selectOption('cat-des-1');

    // Create the categoría from row 0 (fila 1).
    await page.getByLabel('Fila 1: grupo').selectOption('Deseos');
    await page
      .getByRole('button', { name: 'Nueva categoría para fila 1' })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Nueva categoría' }),
    ).toBeVisible();

    // The first patrón arrives prefilled with this row's description.
    await expect(page.getByLabel('Patrón').first()).toHaveValue(
      'PETSHOP HUELLITAS',
    );
    await page.getByLabel('Nombre').fill('Mascotas');
    await page.getByRole('button', { name: 'Crear' }).click();

    // WEB-PRV-16: the announcement names how many OTHER rows changed. Rows 3
    // and 4 flip; row 1 is a duplicate and row 2 is edited, so neither counts.
    const estado = page.getByRole('status', { name: /estado de la subida/i });
    await expect(estado).toContainText('«Mascotas» se aplicó a 2 filas más.');

    // The form closed and the table stayed mounted through the re-run.
    await expect(
      page.getByRole('heading', { name: 'Nueva categoría' }),
    ).toBeHidden();
    await expect(page.getByLabel('Fila 1: grupo')).toBeVisible();

    // The originating row adopted it, and so did the two matching rows.
    for (const n of [1, 4, 5]) {
      await expect(page.getByLabel(`Fila ${n}: categoría`)).toHaveValue(
        'cat-nueva',
      );
    }

    // The manual override is untouched, and the non-matching row keeps its
    // original suggestion (Delivery) — post-#778 every row already carries a
    // real categoría, so it was never a "no bucket chosen yet" row to begin
    // with.
    await expect(page.getByLabel('Fila 3: categoría')).toHaveValue('cat-des-1');
    await expect(page.getByLabel('Fila 6: categoría')).toHaveValue('cat-des-1');
  });

  // Real-browser layout guard for the review table at 360px. It was added
  // for the #748 multi-select help line, since removed together with bulk
  // selection; the overflow check still protects the sticky header and rows.
  // `PreviewMuestra`/`FilaRevision` have no dedicated e2e spec of their own
  // and this route isn't in `mobile-floor.e2e.ts`'s `SCREENS` harness (that
  // harness only covers routes reachable without a stubbed file upload), so
  // this is the only place that measures this table at 360px. Scoped to
  // `movil` only: 360px is the actual risk width, and this file's own
  // `beforeEach` already skips `tablet` (no tablet-specific CSS branch here).
  test('la tabla de revisión no produce desborde horizontal a 360px', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      '360px (movil) es el ancho de riesgo real para esta tabla; ver comentario del test.',
    );

    // `beforeEach` above already stubs the API and the first
    // `/api/ingestas/preview` response with `FILAS_INICIALES` — this test
    // only needs that first render, no re-run.
    await page.goto('/subir');
    await page.locator('#cartola-file').setInputFiles({
      name: 'cartola.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('stub'),
    });
    await page.getByRole('button', { name: 'Revisar y editar' }).click();
    // preview-acordeon-bucket T1: open the (only) bucket/categoría so the
    // row controls — the widest elements in this table — are part of the
    // overflow measurement below, not just the collapsed headers.
    await page.getByRole('button', { name: /^Gustos ·/ }).click();
    await page.getByRole('button', { name: /^Delivery ·/ }).click();
    await expect(page.getByLabel('Fila 1: grupo')).toBeVisible();

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
