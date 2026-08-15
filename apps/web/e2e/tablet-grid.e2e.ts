import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/tablet-grid.e2e.ts — `E-02` (design.md §4), the `WCTG-14` defect
 * committed as an executable `test.fail()` (D-12), BEFORE the grid is
 * repaired. `WCTG-14` claimed the Configuración layout renders a
 * fixed-width tab column beside a fluid content column at T2/T3's measured
 * width (880px) — false as shipped: `ConfiguracionLayout`'s grid activates
 * at `lg` (1024px), and 880 < 1024, so it falls back to `grid-cols-1`, the
 * same stacked layout mobile gets.
 *
 * `test.fail()` inverts the expectation (Playwright semantics): the run is
 * reported GREEN only if this assertion FAILS, exactly as it does today.
 * If a future PR repairs `ConfiguracionLayout`'s grid to `md:` (US-063
 * task 9) WITHOUT removing this annotation (task 10, same PR — D-12), the
 * suite goes RED — an unexpected pass is a failure signal by design,
 * because it means the repair shipped but this file was never updated.
 *
 * Scoped to the `tablet` project only (880px is T2/T3's own measured
 * width, `E-02`'s sole scope in design.md §4) — `movil`/`escritorio` never
 * run this file's assertion body.
 */
test('the tab column is fixed-width and the content column is fluid at 880px (WCTG-14, currently false)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'tablet',
    "E-02 is scoped to T2/T3's measured width (880px) — the tablet project only",
  );
  // Currently false on `main` (US-063 archive-report debt closure, D-12) —
  // committed here as the executable, reviewable fact of the defect this
  // change exists to repair (task 9/10). Remove this call, not the test,
  // once the repair lands.
  test.fail();

  await stubApi(page);
  await page.goto('/configuracion/categorias');

  const grid = page.getByTestId('configuracion-grid');
  const columns = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns,
  );
  const tracks = columns.trim().split(/\s+/);

  expect(tracks).toHaveLength(2);
  expect(tracks[0]).toBe('200px');
});
