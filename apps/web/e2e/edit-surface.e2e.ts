import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/edit-surface.e2e.ts — US-063 PR #4, design.md §4:
 *
 * - `E-06` (360/1280): edit screen — `nav[aria-label="Ruta de navegación"]`
 *   `toBeHidden()` at 360, visible at 1280; `Volver a Categorías`
 *   inversely.
 * - The 640–767px gap (`WCTM-05`): a one-off `test.use({ viewport: {
 *   width: 700, height: 800 } })` override — NOT a fourth named tier
 *   project (D-11's three projects remain the executable definition of
 *   D-01's tier) — asserting `Nombre`/`Bucket` stay stacked at 700px, a
 *   width neither of D-11's named viewports (360, 880) falls inside.
 *   A sibling test reuses the same override for `NuevaCategoriaForm` —
 *   NOT WCTM-05 (that requirement names only `EditarCategoria`), but a
 *   maintainer extension closing the create/edit inconsistency this same
 *   PR would otherwise ship (see `NuevaCategoriaForm.tsx`'s inline
 *   comment).
 * - `E-08` (360/1280): footer — at 360 `Guardar`.y < `Cancelar`.y and
 *   `Guardar`'s width ≈ the content band; at 1280 `Guardar`/`Cancelar`
 *   share a `y` with `Cancelar`.x < `Guardar`.x — D-10's desktop
 *   `flex-row-reverse` restoring the shipped visual order byte-for-byte.
 * - The SC 2.5.8 product defect PR #4 owns (found by the harness on PR
 *   #1): the not-found state's `Volver a Categorías` link now clears the
 *   24×24 floor — jsdom cannot measure real geometry (D-08), so this is
 *   the one place that pin can actually live.
 */

const CONTENT_BAND_TOLERANCE_PX = 2;

test.describe('edit surface — back control replaces the breadcrumb below md (E-06)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('breadcrumb hidden and Volver a Categorías visible at 360; inverse at 1280 (E-06)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'E-06 is scoped to 360px/1280px (design.md §4)',
    );

    await page.goto('/configuracion/categorias/cat-1');
    await page.getByRole('heading', { name: 'Editar categoría' }).waitFor();

    const breadcrumb = page.locator('nav[aria-label="Ruta de navegación"]');
    const volver = page.getByRole('link', { name: 'Volver a Categorías' });

    if (testInfo.project.name === 'movil') {
      await expect(breadcrumb).toBeHidden();
      await expect(volver).toBeVisible();
    } else {
      await expect(breadcrumb).toBeVisible();
      await expect(volver).toBeHidden();
    }
  });
});

test.describe('edit surface — Nombre/Bucket stack across the full mobile range, including 640–767px (WCTM-05)', () => {
  // One-off override (D-11's three named projects stay the executable
  // definition of the tier) — 700px falls inside the 640–767px band the
  // shipped `sm:` boundary used to leave un-stacked. Skipped down to a
  // single project below since the override makes every project render
  // identically at 700px regardless of its own default viewport.
  test.use({ viewport: { width: 700, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Nombre and Bucket have different y at 700px — the 640–767 gap this task closes', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'the 700px override applies regardless of project — running it once is enough',
    );

    await page.goto('/configuracion/categorias/cat-1');
    await page.getByRole('heading', { name: 'Editar categoría' }).waitFor();

    const nombre = page.getByLabel('Nombre', { exact: true });
    const bucket = page.getByLabel('Bucket (obligatorio)');
    const nombreBox = await nombre.boundingBox();
    const bucketBox = await bucket.boundingBox();
    if (!nombreBox || !bucketBox) {
      throw new Error('Nombre/Bucket fields did not render.');
    }

    expect(nombreBox.y).not.toBe(bucketBox.y);
  });
});

test.describe('edit surface — NuevaCategoriaForm stacks across the same 640–767px band (maintainer extension, not WCTM-05)', () => {
  // Same one-off override as the EditarCategoria case above — reused
  // here, not a fourth named tier project.
  test.use({ viewport: { width: 700, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Nombre and Bucket have different y at 700px in the create form too', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'the 700px override applies regardless of project — running it once is enough',
    );

    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();
    await page.getByRole('button', { name: 'Nueva categoría' }).click();

    const nombre = page.getByLabel('Nombre', { exact: true });
    const bucket = page.getByLabel('Bucket (obligatorio)');
    const nombreBox = await nombre.boundingBox();
    const bucketBox = await bucket.boundingBox();
    if (!nombreBox || !bucketBox) {
      throw new Error('Nombre/Bucket fields did not render.');
    }

    expect(nombreBox.y).not.toBe(bucketBox.y);
  });
});

test.describe('edit surface — footer order (E-08, D-10)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Guardar above Cancelar and full-width at 360; Guardar/Cancelar share a row with Cancelar left of Guardar at 1280 (E-08)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'E-08 is scoped to 360px/1280px (design.md §4)',
    );

    await page.goto('/configuracion/categorias/cat-1');
    await page.getByRole('heading', { name: 'Editar categoría' }).waitFor();

    const guardar = page.getByRole('button', { name: 'Guardar' });
    const cancelar = page.getByRole('button', {
      name: 'Cancelar cambios de nombre y bucket',
    });
    // The identity form is a sibling of the footer inside the same content
    // track, so its rendered width IS the content band — the same
    // structural reference other specs in this suite use (design.md §4's
    // framing note: structural, never pixel-literal).
    const form = page.locator('#form-identidad');

    const guardarBox = await guardar.boundingBox();
    const cancelarBox = await cancelar.boundingBox();
    if (!guardarBox || !cancelarBox) {
      throw new Error('Guardar/Cancelar did not render.');
    }

    if (testInfo.project.name === 'movil') {
      expect(guardarBox.y).toBeLessThan(cancelarBox.y);
      const formBox = await form.boundingBox();
      if (!formBox) {
        throw new Error('Identity form did not render.');
      }
      expect(Math.abs(guardarBox.width - formBox.width)).toBeLessThanOrEqual(
        CONTENT_BAND_TOLERANCE_PX,
      );
    } else {
      // `toBeCloseTo`-style tolerance, not exact equality: `Guardar`
      // (`bg-slate-800`, no border) and `Cancelar` (`border
      // border-slate-300`) differ by 2 real CSS px of border height, so
      // `md:items-center` centers their vertical MIDPOINTS, not their top
      // edges — a genuine, deterministic ~1px offset from border width, not
      // a reorder regression. Same structural-tolerance idiom this suite
      // already uses for "share a row" claims (`CONTENT_BAND_TOLERANCE_PX`).
      expect(Math.abs(guardarBox.y - cancelarBox.y)).toBeLessThanOrEqual(
        CONTENT_BAND_TOLERANCE_PX,
      );
      expect(cancelarBox.x).toBeLessThan(guardarBox.x);
    }
  });
});

test.describe('edit surface — SC 2.5.8 product defect owned by PR #4', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('the not-found state Volver a Categorías link clears the 24×24 floor', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'the fix is viewport-independent padding; pinned once, at the width the defect was originally measured at (147.8×20)',
    );

    await page.goto('/configuracion/categorias/cat-inexistente');
    await page.getByText('Esa categoría ya no existe.').waitFor();

    const volver = page.getByRole('link', { name: 'Volver a Categorías' });
    const box = await volver.boundingBox();
    if (!box) {
      throw new Error('Volver a Categorías link did not render.');
    }
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});
