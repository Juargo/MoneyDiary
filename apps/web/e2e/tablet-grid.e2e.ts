import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/tablet-grid.e2e.ts — `E-02` (design.md §4), `WCTG-14` repaired
 * (US-063 tasks 9/10, D-12). PR #1 committed this assertion as an
 * executable `test.fail()` — `WCTG-14` claimed the Configuración layout
 * renders a fixed-width tab column beside a fluid content column at T2/T3's
 * measured width (880px), which was false as shipped:
 * `ConfiguracionLayout`'s grid activated at `lg` (1024px), and 880 < 1024,
 * so it fell back to `grid-cols-1`, the same stacked layout mobile got.
 *
 * Task 9 moved the grid's boundary to `md` (768px), where 880 ≥ 768 holds.
 * This task removes the `test.fail()` annotation — the ONLY change in this
 * file — so the assertion now runs as a normal, permanently pinned
 * regression test: green because the grid genuinely renders two tracks with
 * `200px` first, not because the expectation was inverted.
 *
 * Scoped to the `tablet` project only (880px is T2/T3's own measured
 * width, `E-02`'s sole scope in design.md §4) — `movil`/`escritorio` never
 * run this file's assertion body.
 */
test('the tab column is fixed-width and the content column is fluid at 880px (WCTG-14, repaired)', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'tablet',
    "E-02 is scoped to T2/T3's measured width (880px) — the tablet project only",
  );

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
