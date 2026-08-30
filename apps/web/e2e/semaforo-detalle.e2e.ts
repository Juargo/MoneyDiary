import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/semaforo-detalle.e2e.ts — US-049 T7.8 (design §5, tasks.md ledger).
 * `/semaforo` scopes no new responsive/tablet layout work (the delta's own
 * scenario-label note: "every WSEM scenario is (jsdom)-labeled" — a future
 * mobile `/semaforo` layout would add its own Playwright scenarios then, not
 * here), so both cases run against a single real viewport (`escritorio`,
 * skipped on `movil`/`tablet`) rather than being asserted 3× for no
 * additional claim.
 *
 * `SEMAFORO_DETALLE_FIXTURE` (`fixtures/api-stubs.ts`) puts Necesidades in
 * Amarillo (with a `consejo`) and Deseos/Ahorro in Verde, so the header, all
 * 3 cards, and the zone bar all have real, non-empty content to assert
 * against at a real viewport.
 */

test.describe('/semaforo — deep link + back navigation (US-049)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'No responsive claim for this page — scoped to one real viewport (design delta note).',
    );
    await stubApi(page);
  });

  test('deep link /semaforo?periodo=2026-07 renders the header, worst-of-3 explainer, and 3 bucket cards with a zone bar', async ({
    page,
  }) => {
    await page.goto('/semaforo?periodo=2026-07');

    await expect(page.getByRole('heading', { name: 'Semáforo' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Saludable' })).toBeVisible();
    await expect(
      page.getByText('Tu veredicto del mes es Saludable por Necesidades.'),
    ).toBeVisible();
    await expect(page.getByText(/peor de los tres grupos/i)).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'Necesidades' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gustos' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ahorro' })).toBeVisible();

    await expect(
      page.getByText(
        'Para volver a Muy Saludable, reduce $50.049 en Necesidades este mes.',
      ),
    ).toBeVisible();

    const track = page.getByTestId('zona-bar-track').first();
    await expect(track).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('zona-bar-marker').first()).toBeVisible();
  });

  test('"Volver al resumen" navigates to / keeping ?periodo=2026-07', async ({
    page,
  }) => {
    await page.goto('/semaforo?periodo=2026-07');
    await page.getByRole('heading', { name: 'Semáforo' }).waitFor();

    await page.getByRole('link', { name: 'Volver al resumen' }).click();

    await expect(page).toHaveURL(/\/\?periodo=2026-07/);
  });
});
