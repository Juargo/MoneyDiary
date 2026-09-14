import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/subir-tal-cual.e2e.ts — cartola-preview-confirmacion PR10 (D-07,
 * WEB-PRV-06/19), task 10.5: the "Subir tal cual" path from the decision
 * step, end to end and against stubs only (D-11, `fixtures/api-stubs.ts`
 * docblock — no real backend, ever).
 *
 * Asserts the two things unique to this path that no other e2e spec covers:
 * the request body sent to `POST /api/ingestas/commit` carries `edits: []`
 * (the user never reached the row-level cascade selects), and the flow lands
 * on the `exito` confirmation — not the editable table, which stays reachable
 * only through "Revisar y editar" (`crear-categoria-preview.e2e.ts`,
 * `preview-stress.e2e.ts`).
 *
 * Scoped to `movil` + `escritorio` (skips `tablet`) for the same reason
 * `preview-stress.e2e.ts` documents: the decision step has no tablet-specific
 * CSS branch — it is two/three plain buttons, not a layout that changes
 * between 768–1023px and either neighboring tier.
 */

const FECHA = '2026-07-01T00:00:00.000Z';

function previewFixture() {
  return {
    banco: 'Banco de Chile',
    tipoCuenta: 'Cuenta Corriente',
    numeroCuenta: '00-123-45678-90',
    estructura: { totalFilasDatos: 1 },
    muestra: [],
    filas: [
      {
        rowIndex: 0,
        fecha: FECHA,
        descripcion: 'Supermercado Líder',
        cargo: '15000',
        abono: '0',
        esDuplicado: false,
        sugerido: { bucket: 'Necesidades', categoriaId: 'cat-1' },
      },
    ],
    resumen: { totalFilas: 1, duplicadosDetectados: 0, nuevas: 1 },
  };
}

const COMMIT_FIXTURE = {
  ingestaId: 'ing-e2e-1',
  totalTransacciones: 1,
  duplicadosOmitidos: 0,
  transacciones: [
    {
      abono: '0',
      bucket: 'Necesidades',
      cargo: '15000',
      categoriaId: 'cat-1',
      descripcion: 'Supermercado Líder',
      fecha: FECHA,
    },
  ],
};

// Extracts a single multipart/form-data field's value from the raw request
// body — `postData()` returns the whole encoded body as text, so the field
// is located by its `Content-Disposition` header and read up to the next
// boundary line.
function campoMultipart(cuerpo: string, nombre: string): string | undefined {
  const patron = new RegExp(
    `name="${nombre}"[^]*?\\r?\\n\\r?\\n([^]*?)\\r?\\n--`,
  );
  return patron.exec(cuerpo)?.[1];
}

test.describe('"Subir tal cual" desde el paso de decisión', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'El paso de decisión no tiene rama de CSS propia para tablet (ver preview-stress.e2e.ts).',
    );
    await stubApi(page);
    await page.route('**/api/ingestas/preview', (route) => {
      route.fulfill({ json: previewFixture() });
    });
  });

  test('envía edits: [] y aterriza en la confirmación de éxito, sin pasar por la tabla', async ({
    page,
  }) => {
    let cuerpoCommit: string | null = null;
    await page.route('**/api/ingestas/commit', async (route) => {
      cuerpoCommit = route.request().postData();
      await route.fulfill({ status: 201, json: COMMIT_FIXTURE });
    });

    await page.goto('/subir');
    await page.locator('#cartola-file').setInputFiles({
      name: 'cartola.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('stub'),
    });

    // WEB-PRV-02/19: the decision step renders a read-only grouped summary
    // (MuestraAgrupada), never the editable table — no "Fila N: bucket"
    // control exists until "Revisar y editar" is clicked.
    const subirTalCual = page.getByRole('button', {
      name: 'Subir tal cual',
    });
    await expect(subirTalCual).toBeVisible();
    await expect(page.getByLabel('Fila 1: bucket')).toHaveCount(0);

    await subirTalCual.click();

    // WEB-PRV-06: lands on the exito confirmation, not the table.
    await expect(
      page.getByRole('heading', { name: 'Importación completada' }),
    ).toBeVisible();

    expect(cuerpoCommit).not.toBeNull();
    expect(campoMultipart(cuerpoCommit ?? '', 'edits')).toBe('[]');
  });
});
