import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/list-surface.e2e.ts — US-063 PR #3, design.md §4:
 *
 * - `E-01` completed: `Nueva categoría` spans the content band and sits
 *   below the tab row at 360px (the tabs-row half already lives in
 *   `mobile-header.e2e.ts`, task 16; `CategoriasPanel` was not touched yet
 *   in PR #2).
 * - `E-03`: exactly one action control per row below `md` (CA-02) —
 *   `Editar categoría {n}` visible at all three widths; `Eliminar categoría
 *   {n}` `toBeHidden()` at 360, visible at 880/1280 (`display:none` removes
 *   it from the accessibility tree AND the tab order — D-08's correction to
 *   the proposal's risk table).
 * - `E-04`: the mobile footer note is visible and the other two variants
 *   are hidden, at 360.
 * - `E-09`: for each of the six `WCTM-06`/§1.2 responsive strings, the
 *   band's expected variant is visible and the others are `toBeHidden()` —
 *   assert against rendered/visible content at a real viewport, never
 *   className-literal presence, the exact gap that shipped `WCTG-14` false.
 *
 * `Nueva categoría`'s `movil` and `escritorio` variants share the SAME
 * literal text (WCTM-06's non-monotonic row) — `getByText` alone cannot
 * distinguish them (Playwright's strict mode would find two elements and
 * throw). Those two spans are located STRUCTURALLY (DOM order:
 * `EtiquetaResponsiva` always emits `[movil, tablet, escritorio]`), never by
 * text. Every other string in this file is genuinely distinct per band, so
 * `getByText` is used directly and is unambiguous.
 */

const CONTENT_BAND_TOLERANCE_PX = 2;

function bandIndexFor3Way(projectName: string): number {
  if (projectName === 'movil') return 0;
  if (projectName === 'tablet') return 1;
  return 2;
}

function bandIndexFor2Way(projectName: string): number {
  return projectName === 'movil' ? 0 : 1;
}

async function expectOnlyIndexVisible(
  spans: readonly Locator[],
  activeIndex: number,
): Promise<void> {
  for (let i = 0; i < spans.length; i += 1) {
    if (i === activeIndex) {
      await expect(spans[i]).toBeVisible();
    } else {
      await expect(spans[i]).toBeHidden();
    }
  }
}

test.describe('list surface — Nueva categoría full-width below the tabs (E-01 completed)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Nueva categoría spans the content band and sits below the tab row (E-01)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-01 is scoped to 360px (design.md §4) — the tabs-row half already lives in mobile-header.e2e.ts',
    );

    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const boton = page.getByRole('button', { name: 'Nueva categoría' });
    const contentTrack = page.getByTestId('configuracion-content-track');
    const tabs = page.getByRole('navigation', {
      name: 'Secciones de configuración',
    });

    const botonBox = await boton.boundingBox();
    const contentBox = await contentTrack.boundingBox();
    const tabsBox = await tabs.boundingBox();
    if (!botonBox || !contentBox || !tabsBox) {
      throw new Error(
        'Nueva categoría button, content track, or tabs did not render.',
      );
    }

    expect(Math.abs(botonBox.width - contentBox.width)).toBeLessThanOrEqual(
      CONTENT_BAND_TOLERANCE_PX,
    );
    expect(botonBox.y).toBeGreaterThan(tabsBox.y);
  });
});

test.describe('list surface — exactly one action control per row below md (E-03, CA-02)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Editar categoría Supermercado is visible at all three widths; Eliminar categoría Supermercado is hidden below md, visible at/above md (E-03)', async ({
    page,
  }, testInfo) => {
    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const editar = page.getByRole('link', {
      name: 'Editar categoría Supermercado',
    });
    const eliminar = page.getByRole('button', {
      name: 'Eliminar categoría Supermercado',
    });

    await expect(editar).toBeVisible();
    if (testInfo.project.name === 'movil') {
      await expect(eliminar).toBeHidden();
    } else {
      await expect(eliminar).toBeVisible();
    }
  });
});

test.describe('list surface — mobile footer note explains the single delete path (E-04)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('the mobile note is visible and the other two variants are hidden at 360 (E-04)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-04 is scoped to 360px (design.md §4)',
    );

    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    await expect(
      page.getByText('Toca una categoría para editarla o eliminarla.'),
    ).toBeVisible();
    await expect(
      page.getByText(
        'Eliminar en uso: advertencia, transacciones a Sin categoría.',
      ),
    ).toBeHidden();
    await expect(
      page.getByText(
        'Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.',
      ),
    ).toBeHidden();
  });
});

test.describe('list + edit surface — WCTM-06 six-string band table (E-09)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('Nueva categoría — non-monotonic, movil/escritorio share text, asserted structurally (E-09)', async ({
    page,
  }, testInfo) => {
    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const boton = page.getByRole('button', { name: 'Nueva categoría' });
    const spans = await boton.locator('span').all();
    expect(spans).toHaveLength(3);
    await expectOnlyIndexVisible(
      spans,
      bandIndexFor3Way(testInfo.project.name),
    );
  });

  test('list footer note — three genuinely distinct strings (E-09)', async ({
    page,
  }, testInfo) => {
    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const movil = page.getByText(
      'Toca una categoría para editarla o eliminarla.',
    );
    const tablet = page.getByText(
      'Eliminar en uso: advertencia, transacciones a Sin categoría.',
    );
    const escritorio = page.getByText(
      'Eliminar una categoría en uso muestra advertencia: sus transacciones pasan a Sin categoría.',
    );

    if (testInfo.project.name === 'movil') {
      await expect(movil).toBeVisible();
      await expect(tablet).toBeHidden();
      await expect(escritorio).toBeHidden();
    } else if (testInfo.project.name === 'tablet') {
      await expect(movil).toBeHidden();
      await expect(tablet).toBeVisible();
      await expect(escritorio).toBeHidden();
    } else {
      await expect(movil).toBeHidden();
      await expect(tablet).toBeHidden();
      await expect(escritorio).toBeVisible();
    }
  });

  test('list subtitle — omitted below md, not a copy variant (E-09)', async ({
    page,
  }, testInfo) => {
    await page.goto('/configuracion/categorias');
    await page
      .getByRole('heading', { name: 'Categorías y patrones' })
      .waitFor();

    const subtitulo = page.getByText(
      'Tu catálogo propio: toda categoría pertenece a un bucket. Los patrones permiten la auto-categorización.',
    );
    if (testInfo.project.name === 'movil') {
      await expect(subtitulo).toBeHidden();
    } else {
      await expect(subtitulo).toBeVisible();
    }
  });

  test('Patrones heading, Agregar patrón, and the zero-patrones note on the edit screen (E-09)', async ({
    page,
  }, testInfo) => {
    await page.goto('/configuracion/categorias/cat-1');
    await page.getByRole('heading', { name: 'Editar categoría' }).waitFor();

    const activeIndex = bandIndexFor2Way(testInfo.project.name);

    // `aria-label` (D-04) keeps both accessible names stable across
    // viewports, so these locators resolve to exactly one element
    // regardless of which band is visually active.
    const heading = page.getByRole('heading', {
      name: 'Patrones de auto-categorización',
    });
    const headingSpans = await heading.locator('span').all();
    expect(headingSpans).toHaveLength(2);
    await expectOnlyIndexVisible(headingSpans, activeIndex);

    const agregar = page.getByRole('button', { name: 'Agregar patrón' });
    const agregarSpans = await agregar.locator('span').all();
    expect(agregarSpans).toHaveLength(2);
    await expectOnlyIndexVisible(agregarSpans, activeIndex);

    // Genuinely distinct texts (unlike Nueva categoría) — getByText is
    // unambiguous here.
    const notaCorta = page.getByText('Sin patrones: solo asignación manual.');
    const notaLarga = page.getByText(
      'Sin patrones, la categoría solo se puede asignar manualmente.',
    );
    if (testInfo.project.name === 'movil') {
      await expect(notaCorta).toBeVisible();
      await expect(notaLarga).toBeHidden();
    } else {
      await expect(notaCorta).toBeHidden();
      await expect(notaLarga).toBeVisible();
    }
  });
});
