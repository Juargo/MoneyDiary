import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/mobile-header.e2e.ts — US-063 PR #2, design.md §4:
 *
 * - `E-05` (list): `Volver al inicio` visible at 360, hidden at 1280; the
 *   `Configuración` h1's `boundingBox().height <= 1` at 360 (`sr-only`,
 *   D-07), `> 1` at 1280.
 * - `E-12` (Perfil, D-5): `/configuracion` at 360 inherits `E-05`/`E-10`/
 *   `E-11` from the SAME shared `ConfiguracionLayout`/`ConfiguracionTabs`
 *   chrome, with zero `perfil/**` diff — asserted here, not assumed.
 * - The tabs-row half of `E-01` (D-01/WCTM-02): the two tab links share a
 *   `y` and differ in `x` (one row), and the nav's width ≈ the content
 *   band. The `Nueva categoría` full-width half of `E-01` lands in PR #3
 *   (task 22), since `CategoriasPanel` isn't touched by this PR.
 *
 * `sr-only` renders a 1×1 clipped box and IS visible to Playwright — the
 * h1 assertion below is a geometry check (`boundingBox().height`), never
 * `toBeHidden()` (design.md §1.6 detail 3). `Volver al inicio`, by
 * contrast, is suppressed via `md:hidden` (`display:none`), so
 * `toBeHidden()`/`toBeVisible()` are the correct assertions for it.
 */

const CONTENT_BAND_TOLERANCE_PX = 2;

async function standaloneControlsInMain(page: Page): Promise<Locator[]> {
  // Same idiom as `mobile-floor.e2e.ts`'s `standaloneControlsInMain` — no
  // shared export (this file's own scope is `apps/web/e2e/mobile-header.e2e.ts`
  // only, per tasks.md task 16). Perfil has no breadcrumb-like inline text
  // links today, so there is nothing to exempt here, but the query is still
  // scoped to `main` and waits for the first control before snapshotting —
  // the same race `mobile-floor.e2e.ts` documents (a client-rendered SPA's
  // `load` event fires before React has necessarily mounted routed content).
  const controlsLocator = page.locator('main').locator('button, a[href]');
  await controlsLocator.first().waitFor();
  return controlsLocator.all();
}

test.describe('mobile header — back control + sr-only h1 (E-05, tabs-row half of E-01)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Volver al inicio visible at 360, hidden at 1280; Configuración h1 sr-only at 360, visible at 1280 (E-05)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'E-05 is scoped to 360px/1280px (design.md §4)',
    );

    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const volver = page.getByRole('link', { name: 'Volver al inicio' });
    const h1 = page.getByRole('heading', { level: 1, name: 'Configuración' });

    if (testInfo.project.name === 'movil') {
      await expect(volver).toBeVisible();
      const box = await h1.boundingBox();
      if (!box) {
        throw new Error('Configuración h1 did not render.');
      }
      expect(box.height).toBeLessThanOrEqual(1);
    } else {
      await expect(volver).toBeHidden();
      const box = await h1.boundingBox();
      if (!box) {
        throw new Error('Configuración h1 did not render.');
      }
      expect(box.height).toBeGreaterThan(1);
    }
  });

  test('the two tabs share a y and differ in x; the nav width ≈ the content band at 360 (E-01, tabs-row half)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      "the tabs-row half of E-01 is scoped to 360px — the full-width Nueva categoría half is CategoriasPanel's, PR #3",
    );

    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const perfil = page.getByRole('link', { name: 'Perfil' });
    const categorias = page.getByRole('link', { name: 'Categorías' });
    const nav = page.getByRole('navigation', {
      name: 'Secciones de configuración',
    });
    const grid = page.getByTestId('configuracion-grid');

    const perfilBox = await perfil.boundingBox();
    const categoriasBox = await categorias.boundingBox();
    const navBox = await nav.boundingBox();
    const gridBox = await grid.boundingBox();
    if (!perfilBox || !categoriasBox || !navBox || !gridBox) {
      throw new Error('Tabs or grid did not render.');
    }

    expect(perfilBox.y).toBe(categoriasBox.y);
    expect(perfilBox.x).not.toBe(categoriasBox.x);
    // The nav is a block-level element with no inline padding of its own
    // (only the outer `mx-auto max-w-5xl px-4` wrapper has it), so its
    // width already matches the content band regardless of the tab links'
    // own internal distribution — structural, not pixel-literal (design.md
    // §4's framing note).
    expect(Math.abs(navBox.width - gridBox.width)).toBeLessThanOrEqual(
      CONTENT_BAND_TOLERANCE_PX,
    );
  });
});

test.describe('Perfil (M1) inherits the mobile header with zero perfil/** diff (E-12, D-5)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Volver al inicio + sr-only h1 + no overflow + 24×24 minimum, all at 360, produced entirely by the shared chrome', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-12 is scoped to 360px (design.md §4)',
    );

    await page.goto('/configuracion');
    await page.getByRole('heading', { name: 'Editar perfil' }).waitFor();

    // E-05's Perfil counterpart.
    await expect(
      page.getByRole('link', { name: 'Volver al inicio' }),
    ).toBeVisible();
    const h1Box = await page
      .getByRole('heading', { level: 1, name: 'Configuración' })
      .boundingBox();
    if (!h1Box) {
      throw new Error('Configuración h1 did not render.');
    }
    expect(h1Box.height).toBeLessThanOrEqual(1);

    // E-10's Perfil counterpart: no horizontal overflow.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

    // E-11's Perfil counterpart: every standalone control in <main> meets
    // the 24×24 CSS px minimum.
    const controls = await standaloneControlsInMain(page);
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const box = await control.boundingBox();
      if (!box) {
        continue; // not currently rendered/visible — nothing to measure
      }
      expect(box.width).toBeGreaterThanOrEqual(23.5);
      expect(box.height).toBeGreaterThanOrEqual(23.5);
    }
  });
});
