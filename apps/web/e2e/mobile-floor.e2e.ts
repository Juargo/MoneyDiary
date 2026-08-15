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
  {
    name: 'list',
    path: '/configuracion/categorias',
    // Content-only heading — `CategoriasPanel` only reaches this `<h2>` past
    // its `query.isPending`/`query.isError` early returns (`role="status"`
    // "Cargando…" renders instead until then), so waiting for it rules out
    // measuring the loading skeleton (see `standaloneControlsInMain`'s
    // docblock for why `page.goto`'s `load` event alone is not enough).
    heading: 'Categorías y patrones',
  },
  {
    name: 'edit',
    path: '/configuracion/categorias/cat-1',
    // Same reasoning — `EditarCategoria`'s `<h1>` only renders past its own
    // pending/error/not-found early returns.
    heading: 'Editar categoría',
  },
] as const;

// SC 2.5.8 (WCAG 2.2 AA)'s *Inline* exception exempts a target "in a
// sentence, or whose size is otherwise constrained by the line-height of
// non-target text" from the 24×24 minimum.
//
// **Exactly ONE family qualifies here**: the 3-level breadcrumb links inside
// `nav[aria-label="Ruta de navegación"]`. They are separated by literal "/"
// text within a path — real non-target text on the same line constraining
// them — which is the canonical shape the exception describes. Measured at
// ~17px tall, genuinely below the floor, so this exemption is load-bearing,
// not defensive theatre.
//
// **`Volver a Categorías` does NOT qualify, and is deliberately NOT exempt.**
// An earlier revision of this file exempted it by exact text match. That was
// wrong (judgment-day round 2): those links (`EditarCategoria.tsx:147,158`)
// are `<Link>` siblings of a `<p>`, alone on their own line, with no
// surrounding non-target text — they are standalone back controls, precisely
// what SC 2.5.8 exists to catch. Measured `{ width: 147.8, height: 20 }`:
// a genuine violation, not an exempt case. Exempting it would have made this
// harness — the change's ONLY acceptance layer — assert compliance that does
// not exist.
//
// Consequence, recorded deliberately: no spec currently reaches those
// branches, so nothing goes red today. The first spec that renders the
// error/not-found state WILL fail here, and that failure is correct — see
// the product defect recorded in `tasks.md` for PR #4, which owns the edit
// surface. Do not silence it by re-adding an exemption; fix the control.
//
// Matching is structural (`closest()`), never by text content: a text match
// would also exempt any future large, padded control that happened to reuse
// the same string, turning a real regression into a silent green.
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
      // Same race as `standaloneControlsInMain` (E-11): `page.goto`'s `load`
      // resolves once the SPA's initial script has run — for a
      // client-rendered app that's the FIRST render (`role="status"`
      // "Cargando…"), not the populated screen this assertion exists to
      // measure. Waiting for the screen's own heading (only reachable past
      // the pending/error early returns, see `SCREENS` above) proves real
      // content is on the page before reading `scrollWidth`/`clientWidth`.
      await page.getByRole('heading', { name: screen.heading }).waitFor();
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
