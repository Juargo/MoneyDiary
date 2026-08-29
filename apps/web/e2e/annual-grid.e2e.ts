import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/annual-grid.e2e.ts — US-048 Slice C2b (design.md §6.4), `E-01`..`E-04`.
 * Depends on PR4's restructured `MesCelda` already being live on `main`
 * (`ResumenAnual.tsx`, `MiniSemaforoTag.tsx`) — this file only OBSERVES that
 * state at real viewports, it changes no production code.
 *
 * Every assertion reads rendered geometry or real navigation — never a
 * className (`WG5-10`/`WCTM-01`, R-4's mitigation): this is the exact
 * anti-pattern that shipped `WCTG-14` false (a sizing class present in
 * jsdom markup is not proof the target is ≥24×24 in EFFECT at a real
 * width). `MiniSemaforoTag.test.tsx` (jsdom, §6.2) deliberately omits any
 * `h-7`/`w-7` assertion for the same reason — `E-01` is where that claim is
 * actually proven.
 *
 * Deliberately absent: any assertion on the `✓`/today marker. It depends on
 * the machine's real calendar date (the fixture pins `anio: 2026`, so from
 * 2027 onward no cell is "today"); today-vs-selected distinctness is proven
 * in jsdom instead, where `ahora` is injectable (`ResumenAnual.test.tsx`'s
 * `N-02`).
 */

async function gotoAnnualGrid(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto('/');
  await page
    .getByRole('heading', { name: 'Año 2026 — vista macro por mes' })
    .waitFor();
}

/**
 * A `window` sentinel — set right before the click, read right after — is
 * the real proof a click stayed inside the SPA: a full document reload
 * resets `window`'s own state, so the sentinel surviving is stronger than
 * merely reading the resulting URL (`E-02`, CA-03's "no reload" claim).
 */
async function marcarSentinela(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as Window & { __e2eSentinela?: boolean }).__e2eSentinela = true;
  });
}

async function sentinelaSigueViva(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as Window & { __e2eSentinela?: boolean }).__e2eSentinela === true,
  );
}

test.describe('annual grid — every semáforo tag meets the 24×24 CSS px floor (E-01, WCTG-14)', () => {
  test('all 12 semáforo links have a rendered hit area of at least 24×24 at 360px (E-01)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-01 is scoped to the movil project (360px, the tightest tier — design D-3/§6.4).',
    );

    await gotoAnnualGrid(page);

    const tags = await page.getByRole('link', { name: /^Semáforo de / }).all();
    expect(tags).toHaveLength(12);

    for (const tag of tags) {
      const box = await tag.boundingBox();
      if (!box) {
        throw new Error('A semáforo tag did not render.');
      }
      expect(box.width).toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe('annual grid — clicking a data month switches the main chart, no reload (E-02, CA-03)', () => {
  test('clicking Ver enero 2026 moves the URL and the selected marker, without a document reload (E-02)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'E-02 is scoped to the escritorio project (design §6.4).',
    );

    await gotoAnnualGrid(page);
    await marcarSentinela(page);

    const enero = page.getByRole('button', { name: 'Ver enero 2026' });
    await enero.click();

    await expect(page).toHaveURL(/periodo=2026-01/);
    expect(await sentinelaSigueViva(page)).toBe(true);
    await expect(enero.getByTestId('mes-seleccionado-marker')).toBeVisible();
  });
});

test.describe('annual grid — a semáforo tag navigates to the /semaforo stub (E-03, CA-05)', () => {
  test('clicking Semáforo de marzo 2026 navigates to /semaforo?periodo=2026-03 (E-03)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'E-03 is scoped to the escritorio project (design §6.4).',
    );

    await gotoAnnualGrid(page);

    await page.getByRole('link', { name: /^Semáforo de marzo 2026:/ }).click();

    await expect(page).toHaveURL(/\/semaforo\?periodo=2026-03/);
    await expect(page.getByRole('heading', { name: 'Semáforo' })).toBeVisible();
  });
});

test.describe('annual grid — the semáforo tag never shares hit-test area with the month control (E-05, round-10 critique P2)', () => {
  test('for every one of the 12 cells, the semáforo tag bounding box does not intersect the month control bounding box (E-05)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-05 is scoped to the movil project (360px, the tightest tier — same as E-01/E-04).',
    );

    await gotoAnnualGrid(page);

    const region = page.getByRole('region', {
      name: 'Año 2026 — vista macro por mes',
    });
    const controles = await region.getByRole('button').all();
    const tags = await region
      .getByRole('link', { name: /^Semáforo de / })
      .all();
    expect(controles).toHaveLength(12);
    expect(tags).toHaveLength(12);

    for (let i = 0; i < 12; i += 1) {
      const controlBox = await controles[i].boundingBox();
      const tagBox = await tags[i].boundingBox();
      if (!controlBox || !tagBox) {
        throw new Error('A month control or its semáforo tag did not render.');
      }
      const seSolapan =
        controlBox.x < tagBox.x + tagBox.width &&
        controlBox.x + controlBox.width > tagBox.x &&
        controlBox.y < tagBox.y + tagBox.height &&
        controlBox.y + controlBox.height > tagBox.y;
      expect(seSolapan).toBe(false);
    }
  });
});

test.describe('annual grid — the selected-month marker is a real ≥64×64 box (E-04, CA-02)', () => {
  test('exactly one mes-seleccionado-marker renders, at least 64×64 at 360px (E-04)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'movil',
      'E-04 is scoped to the movil project (design §6.4).',
    );

    await gotoAnnualGrid(page);

    const markers = await page.getByTestId('mes-seleccionado-marker').all();
    expect(markers).toHaveLength(1);

    const box = await markers[0].boundingBox();
    if (!box) {
      throw new Error('The selected-month marker did not render.');
    }
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(64);
  });
});
