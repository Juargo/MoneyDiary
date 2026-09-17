import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/light-chrome.e2e.ts — mirrors `dark-chrome.e2e.ts` for the `:root`
 * default (S4, D1/D2, DCR-04/05). Since S7b (PR11) the selector is live and
 * light is reachable via `page.emulateMedia({ colorScheme: 'light' })`
 * before navigating — no in-page DOM manipulation needed.
 *
 * 2026-09-13 (owner decision, ADR-043 amendment): `light` is now the default
 * preference itself (no preference stored), not merely the OS-follow result
 * under `system` — these tests keep `emulateMedia({ colorScheme: 'light' })`
 * as a belt-and-braces signal, but the assertions below hold even without an
 * OS scheme set, since a first visit with no stored preference starts light
 * regardless of the OS. Same jsdom-can't-paint reasoning as
 * `dark-chrome.e2e.ts`.
 */

test.describe('chrome claro (Clínico frío)', () => {
  test('sin preferencia guardada, el elemento raíz declara color-scheme: light por default', async ({
    page,
  }) => {
    await stubApi(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/?periodo=2026-07');
    await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();

    const esquema = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(esquema).toBe('light');

    const fondo = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(fondo).toBe('rgb(237, 240, 245)');

    const tarjeta = await page
      .locator('[class*="bg-card"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(tarjeta).toBe('rgb(249, 250, 252)');
  });

  test('los <select> nativos pintan la cara Clínico frío al enfocarse, con OS claro', async ({
    page,
  }) => {
    await stubApi(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/buckets/Deseos?periodo=2026-07');

    // bucket-detalle-acordeon: groups collapse by default, so the row
    // holding the <select> is hidden until its heading trigger expands it.
    const primerGrupo = page.getByRole('heading', { level: 2 }).first();
    await primerGrupo.getByRole('button').click();

    const select = page.locator('select').first();
    await select.waitFor();

    // bucket-detalle-lista-rediseño (Cambio 4): this <select>
    // (`ReclasificarCategoriaControl`) went "fantasma" — no border and no
    // background AT REST by deliberate design, so it fuses with the ledger
    // row; only hover/focus paints border + `bg-card`. Tailwind v4's
    // utilities layer beats `@layer base` regardless of source order, so
    // `bg-transparent` wins over `select { background-color: var(--card) }`
    // at rest and this spec's assertion no longer describes that state.
    // What the base rule still guarantees — and what this test now pins —
    // is the FOCUSED face: the moment the control looks interactive it must
    // paint its own surface and never leak the UA's widget theme.
    //
    // Kept byte-for-byte in step with the same change in
    // `dark-chrome.e2e.ts`: these two specs are twins and must not drift.
    await select.focus();

    const fondo = await select.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
    expect(fondo).not.toBe('transparent');

    expect(fondo).toBe('rgb(249, 250, 252)'); // Clínico frío card
  });
});
