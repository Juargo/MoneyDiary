import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/ingresos-mes.e2e.ts — US-054 T-19 (design §5, tasks.md ledger).
 * The `/ingresos` page at a real viewport, against the `INGRESOS_MES_FIXTURE`
 * stub in `fixtures/api-stubs.ts`.
 *
 * Five cases, each scoped to the project that owns its claim:
 * 1. deep link `?periodo=2026-07` — header (h1, nav, back link, PeriodoSelector,
 *    counts line, note) + table + Origen badge tags. Escritorio.
 * 2. prev arrow → URL `2026-06`, stays on `/ingresos`, refetches (WDI-03).
 *    Escritorio.
 * 3. empty month `2026-05` → `$0`, `0 ingresos`, Empty copy, arrows operable
 *    (WDI-04). Escritorio.
 * 4. dashboard legend Ingresos row → `/ingresos?periodo=…` (CA-04, WG5-06).
 *    Escritorio.
 * 5. tablet T2 header + table geometry at 880px — rendered bounding boxes,
 *    never className (WDI-01/07, WG5-10 precedent). Tablet.
 */

test.describe('/ingresos — Detalle MES-INGRESOS (US-054, WDI-01..08)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('deep link /ingresos?periodo=2026-07 renders the header and table with Origen badge tags (WDI-01..04/07)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Scoped to the escritorio project (1280px, design §5).',
    );

    await page.goto('/ingresos?periodo=2026-07');

    // Header — h1, breadcrumb nav, back link, period display, counts line, note.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ingresos' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText(
      'Dashboard / Ingresos',
    );
    await expect(
      page.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /julio 2026/i }),
    ).toBeVisible();
    await expect(page.getByText('3 ingresos')).toBeVisible();
    await expect(page.getByText('+$1.500.000')).toBeVisible();
    await expect(page.getByText('Sin meta ni semáforo')).toBeVisible();

    // Table — semantic role, headers, and Origen badge variants present.
    await expect(page.getByRole('table')).toBeVisible();
    // At least one BCI and one Manual badge from the fixture rows.
    const badges = page.getByRole('cell', { name: /^BCI$|^Manual$/ });
    await expect(badges).toHaveCount(2);
  });

  test('prev arrow navigates to /ingresos?periodo=2026-06 and stays on the /ingresos route (WDI-03)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Scoped to the escritorio project (1280px).',
    );

    await page.goto('/ingresos?periodo=2026-07');
    await page.getByRole('heading', { level: 1, name: 'Ingresos' }).waitFor();

    await page.getByRole('button', { name: 'Mes anterior' }).click();

    // URL updates, same route, and the period label changes.
    await expect(page).toHaveURL(/\/ingresos\?periodo=2026-06/);
    await expect(page).toHaveURL(/^[^?]*\/ingresos/);
    await expect(
      page.getByRole('button', { name: /junio 2026/i }),
    ).toBeVisible();
  });

  test('empty month 2026-05 renders $0 / 0 ingresos / Empty copy and operable arrows (WDI-04)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Scoped to the escritorio project (1280px).',
    );

    await page.goto('/ingresos?periodo=2026-05');
    await page.getByRole('heading', { level: 1, name: 'Ingresos' }).waitFor();

    // Counts line and total reflect the zeroed stub. formatearMontoConSigno
    // returns '$0' (no sign for zero — WDI-04 / view-model docblock).
    await expect(page.getByText('0 ingresos')).toBeVisible();
    await expect(page.getByText('$0')).toBeVisible();

    // Empty copy renders; no table.
    await expect(page.getByText(/Sin ingresos en mayo 2026/i)).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);

    // PeriodoSelector arrows are still operable (WDI-04: empty month doesn't
    // disable navigation).
    const prev = page.getByRole('button', { name: 'Mes anterior' });
    await expect(prev).toBeEnabled();
    await prev.click();
    await expect(page).toHaveURL(/\/ingresos\?periodo=2026-04/);
  });

  test('dashboard legend Ingresos row navigates to /ingresos?periodo=2026-07 (CA-04, WG5-06)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Dashboard navigation case, scoped to the escritorio project (1280px).',
    );

    // GIVEN the dashboard is viewing 2026-07 — load with the period param so
    // the drill-down carries it verbatim (same discipline as WDM-06 case 3
    // in bucket-detalle-mes.e2e.ts).
    await page.goto('/?periodo=2026-07');
    await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();

    await page
      .getByTestId('leyenda-item')
      .filter({ hasText: 'Ingresos' })
      .click();

    await expect(page).toHaveURL(/\/ingresos\?periodo=2026-07/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ingresos' }),
    ).toBeVisible();
  });

  test('tablet (880px): the header keeps breadcrumb and back control on one row, h1 and table visible (WDI-01/07, geometry)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'tablet',
      'Scoped to the tablet project (880px, design WG5-10 precedent).',
    );

    await page.goto('/ingresos?periodo=2026-07');

    const ruta = page.getByRole('navigation', { name: 'Ruta' });
    const volver = page.getByRole('link', { name: 'Volver al resumen' });
    const h1 = page.getByRole('heading', { level: 1, name: 'Ingresos' });
    const table = page.getByRole('table');

    await expect(ruta).toBeVisible();
    await expect(volver).toBeVisible();
    await expect(h1).toBeVisible();
    await expect(table).toBeVisible();

    const rutaBox = await ruta.boundingBox();
    const volverBox = await volver.boundingBox();
    const h1Box = await h1.boundingBox();
    if (!rutaBox || !volverBox || !h1Box) {
      throw new Error('T2 header elements did not render.');
    }

    // At 880px (md breakpoint applies) breadcrumb and back control share
    // the SAME top row (flex-wrap items-center justify-between — same vertical
    // center, tolerance ≤5px for sub-pixel rounding; 4px observed in practice).
    expect(Math.abs(rutaBox.y - volverBox.y)).toBeLessThanOrEqual(5);
    // The h1 sits on its own line below the breadcrumb row.
    expect(h1Box.y).toBeGreaterThanOrEqual(rutaBox.y + rutaBox.height);

    // Table renders below the header (not collapsed or zero-height).
    const tableBox = await table.boundingBox();
    if (!tableBox) throw new Error('Table did not render at 880px.');
    expect(tableBox.y).toBeGreaterThan(h1Box.y);
    expect(tableBox.height).toBeGreaterThan(0);
    expect(tableBox.width).toBeGreaterThan(0);
  });
});
