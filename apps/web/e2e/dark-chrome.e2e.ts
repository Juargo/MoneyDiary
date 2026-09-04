import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/dark-chrome.e2e.ts — guards the two lines of the Tecno-Analítico
 * restyle (2026-09-02) that NOTHING else can see.
 *
 * Both live in `apps/web/src/index.css` and both were found by looking at a
 * screenshot, not by a failing test — the whole unit suite (1744 tests), lint,
 * `tsc` and the production build were green while the app rendered native
 * `<select>` controls with a light face on the matte-dark ground:
 *
 * 1. `color-scheme: dark` on `:root`. It was first written on `body`, where
 *    it still INHERITS down to every control — so the element computed
 *    `dark` and looked correct to any check that asked the element. The UA,
 *    however, reads the ROOT element's used value to theme the viewport
 *    canvas and its native widgets, and root computed `normal`. Asserting on
 *    the `<select>` alone would NOT have caught it; this spec asserts on
 *    `document.documentElement` for exactly that reason.
 * 2. `select, option { background-color: var(--card) }` in `@layer base`.
 *    The app's two native selects (`CampoSelect`,
 *    `ReclasificarCategoriaControl`) set a text colour and a border but no
 *    background, so the face fell through to the UA widget theme.
 *
 * Why e2e and not jsdom: jsdom does not paint, does not resolve `@layer base`
 * UA-default interactions, and has no notion of `color-scheme` widget
 * theming — the same reason `playwright.config.ts` runs `vite preview` of the
 * PRODUCTION build rather than `vite dev` for every CSS claim in this suite.
 *
 * Failure mode this exists to catch: a future CSS cleanup (consolidating
 * `@layer base`, or adopting a shadcn `Select` primitive and deleting the
 * native-control rule as "dead") silently drops either line and the dropdowns
 * revert to a light OS-themed face inside a dark app. Nothing else reports it.
 */

test.describe('chrome oscuro', () => {
  test('el elemento raíz declara color-scheme: dark, no solo el body', async ({
    page,
  }) => {
    await stubApi(page);
    await page.goto('/?periodo=2026-07');
    await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();

    const esquema = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(esquema).toBe('dark');
  });

  test('los <select> nativos pintan su propia cara oscura, sin depender del tema del UA', async ({
    page,
  }) => {
    await stubApi(page);
    await page.goto('/buckets/Deseos?periodo=2026-07');
    const select = page.locator('select').first();
    await select.waitFor();

    const fondo = await select.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // The concrete regression is "transparent, so the UA paints it": that is
    // what the control resolved to before the `@layer base` rule existed.
    expect(fondo).not.toBe('rgba(0, 0, 0, 0)');
    expect(fondo).not.toBe('transparent');

    // And it must be the card surface (#11131a), not merely "some colour" —
    // a select that drifts off the token would still pass the check above.
    expect(fondo).toBe('rgb(17, 19, 26)');
  });
});
