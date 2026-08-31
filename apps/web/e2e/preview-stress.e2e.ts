import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures/api-stubs';
import { buildPreviewStressFixture } from './fixtures/preview-stress-fixture';

/**
 * e2e/preview-stress.e2e.ts — MEASUREMENT harness for the Impeccable
 * critique P3 on the cartola upload review table ("full row list rendered
 * by product decision; mitigations exist but never stress-tested at real
 * scale"). `PreviewMuestra`'s own docblock names the product decision this
 * spec is measuring, not re-litigating: "product decision 4 renders the
 * full list without pagination or virtualization."
 *
 * The repo's real `.xlsx` fixtures top out at ~30 rows; a real Chilean
 * cartola runs 100-300 movements/month. This spec stubs a 300-row
 * `POST /api/ingestas/preview` response (`fixtures/preview-stress-fixture.ts`)
 * — same stub-everything doctrine as the rest of `e2e/` (D-11,
 * `fixtures/api-stubs.ts`'s own docblock): no real backend, ever.
 *
 * Budgets (documented here, not asserted as hard `expect` failures — see the
 * rationale at the bottom of this file for why): initial render < 2s,
 * per-interaction latency < 300ms, on a local dev machine. CI machines run
 * slower, so a CI-enforced version of this budget would need a 3-4x
 * multiplier — the spec therefore asserts only FUNCTIONAL outcomes (safe at
 * any runner speed; in CI it acts as a 300-row smoke test) and logs the
 * latency numbers instead of gating on them (see the file-end rationale).
 *
 * Scoped to `movil` + `escritorio` only (skips `tablet`): the review table
 * has no tablet-specific CSS branch — `FilaRevision`'s `sm:` breakpoint
 * (640px) already applies at the tablet viewport (880px) and at desktop
 * (1280px) identically, so a third measurement run would repeat the
 * `escritorio` code path for zero additional signal (same reasoning
 * `semaforo-detalle.e2e.ts` already documents for its own viewport scoping).
 */

const ROW_COUNT = 300;
const { fixture, meta } = buildPreviewStressFixture(ROW_COUNT);
const lastRowLabel = `Fila ${meta.rowCount}: bucket`;
const midRowLabelBucket = `Fila ${meta.midRowIndex + 1}: bucket`;
const midRowLabelCategoria = `Fila ${meta.midRowIndex + 1}: categoría`;
const visiblesSeleccionablesCount = meta.rowCount - meta.duplicateCount;

interface Medicion {
  readonly proyecto: string;
  readonly metrica: string;
  readonly ms: number;
}

const mediciones: Medicion[] = [];

function registrar(proyecto: string, metrica: string, ms: number) {
  mediciones.push({ proyecto, metrica, ms: Math.round(ms) });
}

test.describe('preview review table — stress at realistic scale (300 rows)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === 'tablet',
      'No separate tablet CSS branch for this table (see file docblock) — measured at movil + escritorio only.',
    );
    await stubApi(page);
    // Overrides the fixture-scale `POST /api/ingestas/preview` for THIS
    // spec only — registered after `stubApi` (LIFO-irrelevant here: no
    // pre-existing stub for this route in `api-stubs.ts`).
    await page.route('**/api/ingestas/preview', (route) => {
      route.fulfill({ json: fixture });
    });
  });

  test('renders 300 rows and measures interaction/scroll latency', async ({
    page,
  }, testInfo) => {
    // 300 rows + 6 measured interactions comfortably exceed Playwright's
    // default 30s test timeout on a loaded dev machine (movil emulation is
    // the slower of the two projects) — this is a measurement run, not a
    // budget assertion, so it gets room to finish rather than racing the
    // harness's own default.
    test.setTimeout(60_000);
    const proyecto = testInfo.project.name;

    await page.goto('/subir');

    // --- 1. Initial render: file pick -> 300-row table fully interactive ---
    const t0Render = performance.now();
    await page.locator('#cartola-file').setInputFiles({
      name: 'cartola-stress.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('dummy-stress-fixture-content'),
    });
    // The LAST row's bucket <select> is the strongest "fully rendered AND
    // interactive" signal available — it only exists once React has mapped
    // all 300 `filas` to `<FilaRevision>` (`PreviewMuestra` maps in file
    // order, filas arrive rowIndex-ascending) and it's a real form control,
    // not just static text.
    await expect(page.getByLabel(lastRowLabel)).toBeVisible({
      timeout: 15_000,
    });
    const initialRenderMs = performance.now() - t0Render;
    registrar(proyecto, 'render inicial (300 filas)', initialRenderMs);

    const previewRegion = page.locator(
      'section[aria-labelledby="preview-listo-heading"]',
    );

    // --- 2. Master "select all visible" toggle, with 300 rows selected ---
    // (One initial warm render already happened above — every measurement
    // from here on runs against an already-rendered, already-warm tree.)
    const selectAllCheckbox = page.getByLabel(
      /seleccionar (todas las visibles|la visible)/i,
    );
    const bulkApplyButton = page.getByRole('button', {
      name: new RegExp(
        `aplicar a ${visiblesSeleccionablesCount} seleccionadas`,
        'i',
      ),
    });

    const t0SelectAll = performance.now();
    await selectAllCheckbox.click();
    await expect(bulkApplyButton).toBeVisible();
    const selectAllMs = performance.now() - t0SelectAll;
    registrar(
      proyecto,
      `select-all visible (${visiblesSeleccionablesCount} filas)`,
      selectAllMs,
    );

    // Clear the selection before the filter measurement below — not timed,
    // this is cleanup so the filter toggle starts from a known state.
    await page.getByRole('button', { name: 'Limpiar selección' }).click();
    await expect(bulkApplyButton).toBeHidden();

    // --- 3. "Solo sin clasificar" filter toggle (on, then off) ---
    const filterButton = page.getByRole('button', {
      name: 'Solo sin clasificar',
    });

    const t0FilterOn = performance.now();
    await filterButton.click();
    await expect(previewRegion.locator('li')).toHaveCount(
      meta.unclassifiedCount,
    );
    const filterOnMs = performance.now() - t0FilterOn;
    registrar(proyecto, 'filtro "Solo sin clasificar" (activar)', filterOnMs);

    const t0FilterOff = performance.now();
    await filterButton.click();
    await expect(previewRegion.locator('li')).toHaveCount(meta.rowCount);
    const filterOffMs = performance.now() - t0FilterOff;
    registrar(
      proyecto,
      'filtro "Solo sin clasificar" (desactivar)',
      filterOffMs,
    );

    // --- 4. One per-row classification interaction, mid-list (~row 150) ---
    // `midRowIndex` is forced non-duplicate + unclassified by the fixture
    // generator, so this always exercises the real bucket->categoría
    // cascade, never a no-op re-selection. The bucket control is a
    // `SelectorBucket` radio group (`fieldset[aria-label="Fila N: bucket"]`,
    // 2026-08-30 polish pass) and the categoría `<select>` only renders once
    // a bucket other than "Sin categoría" is checked — so the flow is:
    // check the "Necesidades" radio, then pick the categoría.
    const bucketGroup = page.getByLabel(midRowLabelBucket);
    const bucketNecesidades = bucketGroup.getByRole('radio', {
      name: 'Necesidades',
    });
    // The radio itself is `sr-only` (1×1 px, clipped): its chip `<label>`
    // intercepts the pointer, so `radio.check()` can never land a click.
    // Click the visible chip instead — the real user path (native label
    // toggles its radio) — and assert the radio state afterwards.
    const chipNecesidades = bucketGroup.getByText('Necesidades', {
      exact: true,
    });
    const categoriaSelect = page.getByLabel(midRowLabelCategoria);
    const progressText = page.getByText(
      new RegExp(`${meta.classifiedCount + 1} de \\d+ clasificadas?`),
    );

    // Guards against the catalog fetch racing the preview render — both are
    // stubbed near-instant, but this makes the precondition explicit rather
    // than relying on timing luck. (Checked on the radio, not the fieldset:
    // Playwright's `toBeEnabled` only inspects form controls.)
    await expect(bucketNecesidades).toBeEnabled();

    const t0RowSelect = performance.now();
    await chipNecesidades.click();
    await expect(bucketNecesidades).toBeChecked();
    await categoriaSelect.selectOption('cat-1');
    await expect(progressText).toBeVisible();
    const rowSelectMs = performance.now() - t0RowSelect;
    registrar(
      proyecto,
      'clasificar 1 fila mid-list (bucket+categoría)',
      rowSelectMs,
    );

    // --- 5. Scroll to bottom + long-task (jank) signal ---
    await page.evaluate(() => {
      const win = window as Window & { __longTasks?: number[] };
      win.__longTasks = [];
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          win.__longTasks?.push(entry.duration);
        }
      });
      obs.observe({ entryTypes: ['longtask'] });
    });

    const t0Scroll = performance.now();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByLabel(lastRowLabel)).toBeInViewport();
    const scrollMs = performance.now() - t0Scroll;
    registrar(proyecto, 'scroll programático al final', scrollMs);

    const longTasks = await page.evaluate(
      () => (window as Window & { __longTasks?: number[] }).__longTasks ?? [],
    );
    testInfo.annotations.push({
      type: 'long-tasks',
      description: `${proyecto}: ${longTasks.length} long task(s) during scroll — durations(ms): [${longTasks.map((d) => Math.round(d)).join(', ')}]`,
    });

    // this spec is a measurement harness (see file docblock).
    console.log(
      `[preview-stress:${proyecto}] ${JSON.stringify(
        mediciones.filter((m) => m.proyecto === proyecto),
      )}`,
    );
  });
});

/**
 * CI runs this spec (the "E2E (Playwright, web)" job runs the whole
 * `testMatch: '**\/*.e2e.ts'` suite) — and that is fine BY DESIGN: every
 * assertion above is functional (rows render, master toggle works, filter
 * works, a mid-list row classifies, scroll reaches the bottom — all at
 * 300 rows), so in CI this acts as a functional smoke test at realistic
 * scale, immune to runner speed.
 *
 * The LATENCY numbers this spec prints are deliberately logged, never
 * asserted: on a local dev machine they sit comfortably inside the
 * proposed budgets (render <2s, interactions <300ms) with low run-to-run
 * variance, but a CI budget would need a blind 3-4x multiplier with no
 * CI-machine data to calibrate against — a gate that either catches
 * nothing or flakes on a slow runner for a table that isn't actually
 * degrading. Per the critique's own bar ("add virtualization only if it
 * actually degrades"), the measured numbers say it does NOT degrade at
 * 300 rows — there is no perf regression to guard with a budget
 * assertion. Re-run BY HAND for fresh numbers (`pnpm exec playwright test
 * preview-stress.e2e.ts --project=movil --project=escritorio`) whenever
 * `PreviewMuestra`/`FilaRevision` change materially.
 */
