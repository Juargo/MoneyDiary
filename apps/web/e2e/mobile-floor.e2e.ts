import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/mobile-floor.e2e.ts — assertions that MUST already be true on `main`,
 * zero product dependency (US-063 tasks.md task 6). These close US-043's
 * archive-report debt 1: `WCTG-13`'s three floors (no overflow, Nombre/
 * Bucket stack, every control ≥24×24) and `WCTG-14` scenario 2 (Nombre/
 * Bucket stay side by side at tablet width) were only ever a MANUAL pass
 * (skipped by maintainer decision at US-043's archive) — this file makes
 * that pass executable for the first time.
 *
 * If any assertion here is red against `main`, that is a genuine
 * pre-existing `WCTG-13` defect this harness just found — report it, do
 * NOT adjust the assertion to fit (design.md §8, tasks.md task 6).
 */

const SCREENS = [
  { name: 'list', path: '/configuracion/categorias' },
  { name: 'edit', path: '/configuracion/categorias/cat-1' },
] as const;

// SC 2.5.8 (WCAG 2.2 AA)'s *Inline* exception: a target "in a sentence or
// whose size is otherwise constrained by the line-height of non-target
// text" is exempt from the 24×24 minimum. `EditarCategoria`'s 3-level
// breadcrumb links are inline text (`text-sm`, ~20px tall, embedded in a
// sentence-like path) — a naive `button, a` sweep would flag them and
// invite inflating a breadcrumb to satisfy a criterion that never applied
// to it (design.md §4, `E-11` note).
const RUTA_NAVEGACION_SELECTOR = 'nav[aria-label="Ruta de navegación"]';

async function standaloneControlsInMain(page: Page): Promise<Locator[]> {
  const controlsLocator = page.locator('main').locator('button, a[href]');
  // This is a client-rendered SPA (no SSR) — `page.goto`'s `load` event
  // fires once the initial document/script finish, before React has
  // necessarily mounted the routed content. `.all()` snapshots the DOM
  // immediately with no auto-wait, so without this the query can run
  // against an empty `<main>` and silently report zero controls (the exact
  // "class name present but nothing actually rendered" gap this whole
  // harness exists to close). Waiting for the first match to appear is the
  // auto-waiting step `.all()` itself doesn't do.
  await controlsLocator.first().waitFor();
  const all = await controlsLocator.all();
  const standalone: Locator[] = [];
  for (const control of all) {
    const isInlineTextLink = await control.evaluate(
      (el, selector) => el.closest(selector) !== null,
      RUTA_NAVEGACION_SELECTOR,
    );
    if (!isInlineTextLink) {
      standalone.push(control);
    }
  }
  return standalone;
}

test.describe('mobile floor — must already hold on main (WCTG-13, WCTG-14 scenario 2)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Nombre/Bucket: different y and equal width at 360; equal y at 880 (E-07)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'escritorio',
      "E-07 is scoped to 360px/880px (design.md §4) — the edit screen's field grid at desktop is unaffected either way",
    );

    await page.goto('/configuracion/categorias/cat-1');
    // `exact: true` (getByLabel's default is a case-insensitive SUBSTRING
    // match) — without it, `getByLabel('Nombre')` also matches the
    // footer's `Cancelar` button, whose accessible name is "Cancelar
    // cambios de nombre y bucket" (lowercase "nombre" inside it).
    const nombre = page.getByLabel('Nombre', { exact: true });
    // NOT `exact` here: a real browser's accessible-name computation for a
    // `<label>`-wrapped `<select>` (role `combobox`) appends the SELECTED
    // option's own text to the label text (e.g. "Bucket (obligatorio)
    // Necesidades") — unlike jsdom/Testing Library's `getByLabelText`,
    // which strips the control's value. A substring match still resolves
    // uniquely; `exact: true` here would time out against every option.
    const bucket = page.getByLabel('Bucket (obligatorio)');
    const nombreBox = await nombre.boundingBox();
    const bucketBox = await bucket.boundingBox();
    if (!nombreBox || !bucketBox) {
      throw new Error('Nombre/Bucket fields did not render.');
    }

    if (testInfo.project.name === 'movil') {
      // Stacked: different row, same column width.
      expect(nombreBox.y).not.toBe(bucketBox.y);
      expect(Math.round(nombreBox.width)).toBe(Math.round(bucketBox.width));
    } else {
      // tablet (880px): the existing `sm:` (640px) boundary is already
      // active — side by side, same row (WCTG-14 scenario 2, already true).
      expect(nombreBox.y).toBe(bucketBox.y);
    }
  });

  for (const screen of SCREENS) {
    test(`no horizontal overflow on the ${screen.name} screen (E-10)`, async ({
      page,
    }) => {
      await page.goto(screen.path);
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    });

    test(`every standalone control in <main> meets the 24×24 CSS px minimum on the ${screen.name} screen (E-11)`, async ({
      page,
    }) => {
      await page.goto(screen.path);
      const controls = await standaloneControlsInMain(page);
      // A silent no-op (zero controls found) would pass vacuously — the
      // exact class of gap that shipped `WCTG-14` false (design.md §4).
      expect(controls.length).toBeGreaterThan(0);

      for (const control of controls) {
        const box = await control.boundingBox();
        if (!box) {
          continue; // not currently rendered/visible — nothing to measure
        }
        // Half-pixel tolerance for subpixel layout rounding — never a
        // loosening of the 24px requirement itself (WCAG 2.2 AA SC 2.5.8).
        expect(box.width).toBeGreaterThanOrEqual(23.5);
        expect(box.height).toBeGreaterThanOrEqual(23.5);
      }
    });
  }
});
