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

  test('los <select> nativos son transparentes en reposo con tinta del tema, y pintan la cara Clínico frío al enfocarse', async ({
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

    // bucket-detalle-lista-rediseño (Cambio 4): este <select>
    // (`ReclasificarCategoriaControl`) pasó a ser "fantasma" — sin borde y sin
    // fondo EN REPOSO, por diseño, para fundirse con la fila del libro mayor;
    // sólo hover/foco pintan borde + `bg-card`. En Tailwind v4 la capa de
    // utilities le gana a base sin importar el orden, así que `bg-transparent`
    // vence a `select { background-color: var(--card) }` en reposo.
    //
    // El contrato son DOS estados y este test fija los dos. Una revisión
    // anterior sólo afirmaba el enfocado, y el reposo quedaba sin vigilancia:
    // nadie probaba que la transparencia fuera deliberada ni que la tinta
    // saliera del tema.
    //
    // Se mantiene en espejo exacto con `dark-chrome.e2e.ts`: son gemelos y no
    // deben driftear — si uno cambia, el otro cambia en el mismo commit.

    // REPOSO — transparente a propósito, con la tinta del TEMA.
    const reposo = await select.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fondo: cs.backgroundColor, tinta: cs.color };
    });
    expect(reposo.fondo).toBe('rgba(0, 0, 0, 0)');
    // `--muted-foreground` de Clínico frío (#5a6270) — no un gris del UA.
    expect(reposo.tinta).toBe('rgb(90, 98, 112)');

    // ENFOCADO — pinta su propia superficie, nunca la del widget del UA.
    await select.focus();

    const fondo = await select.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
    expect(fondo).not.toBe('transparent');

    expect(fondo).toBe('rgb(249, 250, 252)'); // Clínico frío card
  });
});
