import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';

/**
 * e2e/bucket-detalle-mes.e2e.ts — US-053 T-20/T-21 + US-055 T-08 (design
 * §5, tasks.md ledger). The `/buckets/:bucket` Detalle MES-BUCKET page at a
 * real viewport, against the grouped endpoint stub (`DETALLE_BUCKET_MES_FIXTURE`
 * in `fixtures/api-stubs.ts`).
 *
 * Five cases, each scoped to the project that owns its claim:
 * 1. deep link `?periodo=2026-07` — the WDM-01 header (breadcrumb, back
 *    link, %/meta tag, usage bar, totals line) + the WDM-03 groups verbatim,
 *    both collapsed by default (bucket-detalle-acordeon): Paseos's 12 rows
 *    stay hidden until its heading trigger is activated, then all 12 show
 *    (no truncation, no "ver N más…" control anywhere). Escritorio.
 * 2. tablet T1 header geometry (WDM-01 Playwright scenario) — breadcrumb
 *    and back control share one row at ≥768px (the "back control below md"
 *    rule only stacks them below the `md` breakpoint); the `h1` sits on its
 *    own line below. Asserted by rendered bounding boxes, never className
 *    presence (the WCTG-14/WG5-10 gap). Tablet only.
 * 3. dashboard legend row → `/buckets/Deseos?periodo=…` (WDM-06/WCAT-01:
 *    navigation, never an inline panel swap). Escritorio.
 * 4. dashboard Sin categoría row → `/buckets/SinCategoria?…&destacar=…`
 *    (WDM-04/06): the Sin categoría group carries the highlight, and the
 *    SinCategoria bucket renders no %/meta tag and no usage bar (MBD-03,
 *    D-02). Escritorio.
 * 5. US-055 T-08 — cross-bucket reclassify surfaces the announcement in the
 *    page-owned `role="status"` region AND the URL retains `?periodo=` (D-07,
 *    WCAT-04). Escritorio.
 */

test.describe('/buckets/:bucket — Detalle MES-BUCKET (US-053, WDM-01..04)', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('deep link /buckets/Deseos?periodo=2026-07 renders the WDM-01 header and both WDM-03 groups', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Scoped to the escritorio project (1280px, design §5).',
    );

    await page.goto('/buckets/Deseos?periodo=2026-07');

    // WDM-01 header — breadcrumb (nav aria-label="Ruta"), back link, %/meta
    // tag, usage bar (presentation-only markers, aria-hidden), totals line.
    await expect(
      page.getByRole('heading', { level: 1, name: 'Gustos' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText(
      'Dashboard / Gustos',
    );
    await expect(
      page.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeVisible();
    await expect(page.getByText('25% · Meta: 30%')).toBeVisible();
    const barra = page.getByTestId('usage-bar');
    await expect(barra).toBeVisible();
    await expect(barra).toHaveAttribute('aria-hidden', 'true');
    await expect(
      page.getByText('Total $650.000 · 14 movimientos'),
    ).toBeVisible();

    // WDM-03 — groups render the fixture verbatim (server order), both
    // collapsed by default: their headings are visible, their row lists are
    // not.
    const tituloPaseos = page.getByRole('heading', {
      name: 'Paseos · $600.000 · 12 movimientos',
    });
    await expect(tituloPaseos).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Sin categoría · $50.000 · 2 movimientos',
      }),
    ).toBeVisible();
    const triggerPaseos = tituloPaseos.getByRole('button');
    await expect(triggerPaseos).toHaveAttribute('aria-expanded', 'false');
    const filaUber = page.getByText('Uber', { exact: true });
    await expect(filaUber).not.toBeVisible();

    // Activating the trigger reveals ALL 12 rows — no truncation, no
    // "ver N más…" control anywhere on the page.
    await triggerPaseos.click();
    await expect(triggerPaseos).toHaveAttribute('aria-expanded', 'true');
    await expect(filaUber).toBeVisible();
    await expect(page.getByRole('button', { name: /ver .* más…/ })).toHaveCount(
      0,
    );
  });

  test('tablet (880px): the T1 header keeps breadcrumb and back control on one row, h1 below (WDM-01 geometry)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'tablet',
      'Scoped to the tablet project (880px, design D-09 — T1 tier 768–1023px).',
    );

    await page.goto('/buckets/Deseos?periodo=2026-07');

    const ruta = page.getByRole('navigation', { name: 'Ruta' });
    const volver = page.getByRole('link', { name: 'Volver al resumen' });
    const h1 = page.getByRole('heading', { level: 1, name: 'Gustos' });
    await expect(ruta).toBeVisible();
    await expect(volver).toBeVisible();
    await expect(h1).toBeVisible();

    const rutaBox = await ruta.boundingBox();
    const volverBox = await volver.boundingBox();
    const h1Box = await h1.boundingBox();
    if (!rutaBox || !volverBox || !h1Box) {
      throw new Error('T1 header elements did not render.');
    }

    // WDM-01's "back control below md": at 880px the `md` breakpoint
    // applies, so breadcrumb and back control share the SAME top row
    // (flex-wrap items-center justify-between — same vertical center).
    expect(Math.abs(rutaBox.y - volverBox.y)).toBeLessThan(4);
    // The h1 sits on its own line below that row.
    expect(h1Box.y).toBeGreaterThanOrEqual(rutaBox.y + rutaBox.height);
  });

  test('dashboard legend row navigates to /buckets/Deseos?periodo=2026-07 (WDM-06, WCAT-01)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Dashboard navigation case, scoped to the escritorio project (1280px).',
    );

    // WDM-06 scenario: "GIVEN the dashboard is viewing 2026-07" — load the
    // dashboard WITH the period param so the drill-down carries it verbatim.
    await page.goto('/?periodo=2026-07');
    await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();

    await page
      .getByTestId('leyenda-item')
      .filter({ hasText: 'Gustos' })
      .click();

    await expect(page).toHaveURL(/\/buckets\/Deseos\?periodo=2026-07/);
    // Case 4's `destacar` is opt-in by literal — a non-Sin-categoría
    // drill-down must NEVER carry it (a stray param would fail here).
    await expect(page).not.toHaveURL(/destacar/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Gustos' }),
    ).toBeVisible();
  });

  test('dashboard Sin categoría row navigates with destacar and the group highlights (WDM-04/06)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Dashboard navigation case, scoped to the escritorio project (1280px).',
    );

    // WDM-06 scenario: "GIVEN the dashboard is viewing 2026-07" — same
    // reason as case 3: the drill-down must carry the current `periodo`.
    await page.goto('/?periodo=2026-07');
    await page.getByText('Toca un ítem del gráfico o la leyenda').waitFor();

    await page
      .getByTestId('leyenda-item')
      .filter({ hasText: 'Sin categoría' })
      .click();

    await expect(page).toHaveURL(
      /\/buckets\/SinCategoria\?periodo=2026-07&destacar=sin-categoria/,
    );

    const grupoSinCategoria = page
      .getByTestId('grupo-movimientos')
      .filter({ hasText: 'Sin categoría' });
    await expect(grupoSinCategoria).toHaveAttribute('data-destacado', 'true');
    // bucket-detalle-acordeon: the destacado group starts EXPANDED — the
    // sole exception to WDM-03's collapsed-by-default accordion.
    await expect(
      grupoSinCategoria.getByRole('button', { expanded: true }),
    ).toBeVisible();
    // WDM-04/MBD-03: SinCategoria arrives with null `porcentajeBp`/`metaBp`,
    // so the page renders no %/meta tag and no usage bar (D-02).
    await expect(page.getByTestId('usage-bar')).toHaveCount(0);
  });

  test('cross-bucket reclassify: on /buckets/Necesidades?periodo=2026-07, reclassify to a Deseos categoría → "Movida a Gustos." in role=status, moved row gone after refetch, URL retains ?periodo= (US-055, T-08, D-07/WCAT-04)', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'escritorio',
      'Reclassify interaction case, scoped to the escritorio project (1280px).',
    );

    // Load Necesidades page — Paseos group (12 transactions) is visible.
    // CATALOGO_FIXTURE has Streaming (Deseos), so picking it for a Paseos
    // row is a cross-bucket move (Necesidades → Deseos), which announces
    // ETIQUETA_BUCKET['Deseos'] = 'Gustos'.
    await page.goto('/buckets/Necesidades?periodo=2026-07');
    // Wait for first group heading to confirm the page has settled, then
    // expand it — Paseos starts collapsed (bucket-detalle-acordeon, no
    // `destacar` on this arrival), and its rows/controls are inert while
    // hidden.
    const tituloPaseos = page.getByRole('heading', { name: /Paseos/ });
    await expect(tituloPaseos).toBeVisible();
    await tituloPaseos.getByRole('button').click();

    // The catalog must load before the select enables — wait for it.
    // The first visible row in the Paseos group is 'Uber' (tx-p1).
    const select = page.getByLabel('Bucket y categoría de Uber');
    await expect(select).toBeEnabled({ timeout: 5000 });

    // Pick Streaming (Deseos) — cross-bucket from Necesidades. The option
    // label now carries the bucket prefix (reclasificar-bucket-y-categoria).
    await select.selectOption({ label: 'Gustos · Streaming' });

    // Confirm the alertdialog that appears for a cross-bucket move.
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar' }).click();

    // (i) The page-owned announcement region must show the exact literal.
    // ETIQUETA_BUCKET['Deseos'] = 'Gustos', so the literal is "Movida a
    // Gustos." (with period, per D-07). Scope to the announcement region
    // (data-testid="anuncio-reclasificar") if two role=status nodes coexist
    // with the catalog-loading status; use toHaveText for exact match.
    const anuncio = page.getByTestId('anuncio-reclasificar');
    await expect(anuncio).toHaveText('Movida a Gustos.');

    // (ii) After the PATCH fires, invalidation triggers a refetch. The stub
    // serves the fixture WITHOUT 'Uber' (tx-p1) once detallePatchFired is
    // true. Assert the row is gone from the Paseos group.
    await expect(page.getByText('Uber')).toHaveCount(0);

    // (iii) The URL must still carry ?periodo=2026-07 (no navigation on
    // reclassify — in-place update only, per WCAT-04/D-07).
    await expect(page).toHaveURL(/\/buckets\/Necesidades\?periodo=2026-07/);
  });
});
