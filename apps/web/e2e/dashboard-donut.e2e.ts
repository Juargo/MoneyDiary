import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/dashboard-donut.e2e.ts — US-047 T16 (design §4.3, `WG5-10`). CA-05's
 * T1 tablet variant and the legend divider's viewport-conditional visibility
 * (`WG5-03`) are both `WCTG-14`-class claims — a `md:grid-cols-2`/
 * `hidden lg:block` className string existing in jsdom markup is NOT proof
 * either is actually in EFFECT at a real width (`tablet-grid.e2e.ts`'s own
 * docblock tells this exact story). Every assertion below reads REAL
 * computed geometry (`getComputedStyle`, bounding boxes) at the harness's 3
 * real-viewport projects (`playwright.config.ts`) — never a class-name
 * presence check. A jsdom check exists ONLY as a labelled smoke test, in
 * `ResumenScreen.test.tsx` (T11), not here.
 *
 * Exactly 6 assertions, one test per named proof (tasks.md T16 — "do not
 * collapse them into fewer, harder-to-diagnose tests"): 3 grid-layout + 3
 * divider bounding-box/display.
 */

async function gotoDashboard(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto('/');
  // The donut ring only renders past `ResumenPage`'s pending/error/empty
  // early returns (`sinIngreso: false` in the stub) — waiting for the
  // legend's own content is the same "real content mounted" guard
  // `mobile-floor.e2e.ts`/`list-surface.e2e.ts` already use, not the SPA's
  // `load` event (which fires before React has necessarily painted).
  await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();
}

async function gridTracks(locator: Locator): Promise<string[]> {
  const columns = await locator.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns,
  );
  return columns.trim().split(/\s+/);
}

/**
 * The legend's own bounding box, computed from the union of its 5
 * `leyenda-item` rows (real rendered geometry — not a testid on
 * `LeyendaGasto`'s root, which this change does not add). `principales`
 * (3 spend rows) render before `complemento` (Ingresos, Sin categoría) in
 * DOM order (D-03), so index 2 is always the last spend row and index 3 is
 * always Ingresos — used by the divider-position assertion (#6) below.
 */
async function leyendaItems(page: Page): Promise<Locator[]> {
  return page.getByTestId('leyenda-item').all();
}

async function unionBoundingBox(items: Locator[]) {
  const boxes = await Promise.all(items.map((item) => item.boundingBox()));
  const resolved = boxes.filter((b): b is NonNullable<typeof b> => b !== null);
  if (resolved.length === 0) {
    throw new Error('No leyenda-item rows rendered.');
  }
  const left = Math.min(...resolved.map((b) => b.x));
  const top = Math.min(...resolved.map((b) => b.y));
  const right = Math.max(...resolved.map((b) => b.x + b.width));
  const bottom = Math.max(...resolved.map((b) => b.y + b.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

test.describe('dashboard donut — T1 grid layout (CA-05, WG5-10)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDashboard(page);
  });

  test('tablet (880px): the chart card body resolves 2 computed grid tracks (grid proof 1/3)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'tablet',
      'Scoped to the tablet project (880px, design D-09).',
    );

    const cuerpo = page.getByTestId('grafico-card-body');
    const tracks = await gridTracks(cuerpo);
    expect(tracks).toHaveLength(2);
  });

  test('tablet (880px): the legend sits to the right of the donut, by rendered bounding box (grid proof 2/3)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'tablet',
      'Scoped to the tablet project (880px, design D-09).',
    );

    const donut = page.getByRole('group', { name: 'Distribución del gasto' });
    const donutBox = await donut.boundingBox();
    const legendBox = await unionBoundingBox(await leyendaItems(page));
    if (!donutBox) {
      throw new Error('The donut ring did not render.');
    }

    expect(legendBox.x).toBeGreaterThanOrEqual(donutBox.x + donutBox.width);
  });

  test('tablet (880px): the legend divider is absent from real geometry — display none, zero-area (divider proof 1/3)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'tablet',
      'Scoped to the tablet project (880px, design D-09/WG5-03).',
    );

    const divisor = page.getByTestId('leyenda-divisor');
    const display = await divisor.evaluate(
      (el) => getComputedStyle(el).display,
    );
    const box = await divisor.boundingBox();

    expect(display).toBe('none');
    // `display: none` elements are not rendered — Playwright's own
    // `boundingBox()` resolves to `null` for them, the geometry-level proof
    // of absence (not merely a computed-style read).
    expect(box).toBeNull();
  });

  test('movil (360px): the chart card body resolves 1 computed grid track, and the legend sits below the donut (grid proof 3/3)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'Scoped to the movil project (360px, design D-09).',
    );

    const cuerpo = page.getByTestId('grafico-card-body');
    const tracks = await gridTracks(cuerpo);
    expect(tracks).toHaveLength(1);

    const donut = page.getByRole('group', { name: 'Distribución del gasto' });
    const donutBox = await donut.boundingBox();
    const legendBox = await unionBoundingBox(await leyendaItems(page));
    if (!donutBox) {
      throw new Error('The donut ring did not render.');
    }

    expect(legendBox.y).toBeGreaterThanOrEqual(donutBox.y + donutBox.height);
  });

  test('movil (360px): the legend divider stays absent from real geometry — display none, zero-area (divider proof 2/3, closes the mobile gap)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'Scoped to the movil project (360px, design D-09/WG5-03, WG5-10 mobile scenario).',
    );

    const divisor = page.getByTestId('leyenda-divisor');
    const display = await divisor.evaluate(
      (el) => getComputedStyle(el).display,
    );
    const box = await divisor.boundingBox();

    expect(display).toBe('none');
    expect(box).toBeNull();
  });

  test('escritorio (1280px): the page grid still resolves 2 tracks, and the divider is present between the spend rows and Ingresos/Sin categoría (divider proof 3/3, no lg regression)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Scoped to the escritorio project (1280px, existing lg page-level behavior + design D-09 divider).',
    );

    const paginaGrid = page.getByTestId('dashboard-page-grid');
    const tracks = await gridTracks(paginaGrid);
    expect(tracks).toHaveLength(2);

    const divisor = page.getByTestId('leyenda-divisor');
    const display = await divisor.evaluate(
      (el) => getComputedStyle(el).display,
    );
    const divisorBox = await divisor.boundingBox();
    if (!divisorBox) {
      throw new Error('The legend divider did not render at the desktop tier.');
    }

    expect(display).not.toBe('none');
    expect(divisorBox.width * divisorBox.height).toBeGreaterThan(0);

    const items = await leyendaItems(page);
    expect(items).toHaveLength(5);
    const ultimoGasto = await items[2].boundingBox();
    const ingresos = await items[3].boundingBox();
    if (!ultimoGasto || !ingresos) {
      throw new Error('Legend rows did not render.');
    }

    // Sits between the last spend row (Ahorro) and Ingresos, in DOM/render
    // order (D-03: principales, then the structural divider, then
    // complemento).
    expect(divisorBox.y).toBeGreaterThanOrEqual(
      ultimoGasto.y + ultimoGasto.height,
    );
    expect(divisorBox.y + divisorBox.height).toBeLessThanOrEqual(ingresos.y);
  });
});
