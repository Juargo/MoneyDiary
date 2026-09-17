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
 *    link, totals strip — bucket-detalle-lista-rediseño retires the old
 *    %/meta tag and usage bar) + the WDM-03 groups verbatim, both collapsed
 *    by default (bucket-detalle-acordeon): Paseos's 12 rows stay hidden
 *    until its heading trigger is activated, then all 12 show (no
 *    truncation, no "ver N más…" control anywhere). Escritorio.
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
    // El conteo del encabezado de grupo es `hidden sm:block`
    // (bucket-detalle-lista-rediseño): a 360px NO forma parte del nombre
    // accesible del heading, porque el dato se muda al strip de columnas de la
    // lista. El assert no se debilita en móvil — se REUBICA donde el diseño
    // puso el dato (ver el bloque de expansión al final de este test).
    const esMovil = testInfo.project.name === 'movil';

    await page.goto('/buckets/Deseos?periodo=2026-07');

    // WDM-01 header — breadcrumb (nav aria-label="Ruta"), back link, totals
    // strip (bucket-detalle-lista-rediseño Cambio 2: replaces the retired
    // %/meta tag + usage bar — the total becomes the page's one large figure).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Gustos' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText(
      'Dashboard / Gustos',
    );
    await expect(
      page.getByRole('link', { name: 'Volver al resumen' }),
    ).toBeVisible();
    // The totals strip is asserted SCOPED TO `<header>`, never page-wide.
    // `exact: true` alone is not enough on a ledger screen: every figure in
    // the strip also occurs, verbatim, further down the page. The conteo
    // "14" is the sharp case — the rows' own day-of-month column renders a
    // bare "14" for any movement dated the 14th, so an unscoped
    // `getByText('14', { exact: true })` resolves to three nodes and fails
    // Playwright's strict mode. Same reasoning for the labels: "movimientos"
    // occurs lowercase inside every group heading's own conteo
    // ("12 movimientos").
    const totales = page.locator('header');
    await expect(
      totales.getByText('Total del mes', { exact: true }),
    ).toBeVisible();
    await expect(totales.getByText('$650.000', { exact: true })).toBeVisible();
    await expect(
      totales.getByText('Movimientos', { exact: true }),
    ).toBeVisible();
    await expect(totales.getByText('14', { exact: true })).toBeVisible();

    // WDM-03 — groups render the fixture verbatim (server order), both
    // collapsed by default: their headings are visible, their row lists are
    // not. The heading's accessible name has no middots between
    // nombre/subtotal/conteo (bucket-detalle-lista-rediseño Cambio 3).
    const nombrePaseos = esMovil
      ? 'Paseos $600.000'
      : 'Paseos $600.000 12 movimientos';
    const nombreSinCategoria = esMovil
      ? 'Sin categoría $50.000'
      : 'Sin categoría $50.000 2 movimientos';
    const tituloPaseos = page.getByRole('heading', { name: nombrePaseos });
    await expect(tituloPaseos).toBeVisible();
    const tituloSinCategoria = page.getByRole('heading', {
      name: nombreSinCategoria,
    });
    await expect(tituloSinCategoria).toBeVisible();

    // categoria-iconografia (WDM-03, CATICO-06): Paseos carries the fixture's
    // allowlisted `icono: 'bike'` — its heading badge renders that glyph. The
    // synthetic Sin categoría group's `icono` is always null server-side
    // (MBD-02), so its badge renders the generic `Tag` fallback instead.
    await expect(tituloPaseos.locator('svg.lucide-bike')).toBeVisible();
    await expect(tituloSinCategoria.locator('svg.lucide-tag')).toBeVisible();

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

    // Acá se paga la deuda del heading: en móvil el conteo salió del nombre
    // accesible, pero NO desapareció de la pantalla — vive en el strip de
    // columnas del grupo, que recién existe una vez expandido. Sin esta
    // aserción, correr en móvil habría significado verificar MENOS; con ella,
    // el dato queda fijado en los tres viewports, cada uno donde el diseño lo
    // pone. El strip lleva `aria-hidden` (es un `<ul>`, no una tabla), lo cual
    // no afecta a `getByText`: esconde del árbol de accesibilidad, no del DOM.
    // Scopeado por el nombre accesible de la REGIÓN (`<section
    // aria-labelledby>`), no por `filter({ hasText: 'Paseos' })`: desde que el
    // fixture completó el catálogo con `cat-paseos` (#703), el `<select>` de
    // CADA fila lleva la opción "Gustos · Paseos", así que filtrar por ese
    // texto matchea los dos grupos. El nombre de la región es el único
    // identificador que no se contamina con el contenido de las filas.
    const grupoPaseos = page.getByRole('region', { name: nombrePaseos });
    // El conteo existe DOS veces en el DOM del grupo — uno en el encabezado
    // (`hidden sm:block`) y otro en el strip de columnas (`sm:hidden`) — y
    // cada breakpoint esconde uno. Así que la aserción no necesita ramificar
    // por viewport: se exige que haya EXACTAMENTE UNO visible, y eso vale en
    // los tres. Es más fuerte que un `toBeVisible` con `if`, porque también
    // caza el bug contrario: que se muestren los dos a la vez, o ninguno, si
    // alguien toca esas clases responsive.
    await expect(
      grupoPaseos.getByText('12 movimientos').filter({ visible: true }),
    ).toHaveCount(1);
    // El mes y el año se dicen UNA vez por lista, en el encabezado de la
    // columna de fecha, en los tres viewports.
    await expect(grupoPaseos.getByText('JUL 2026')).toBeVisible();
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
    //
    // CENTERS, not top edges — the contract this line has always stated is
    // "same vertical center", and comparing `y` was only ever a proxy that
    // happened to hold while both boxes were the same 20px text line. They
    // no longer are: `Volver al resumen` became a `Button asChild`
    // (`size="sm"`, 32px tall) so it clears SC 2.5.8's 24px target floor —
    // `mobile-floor.e2e.ts`'s E-11 sweep measured the bare link at 20px.
    // Under `items-center` the two centers still coincide exactly while the
    // TOPS differ by half the height delta (6px). The geometry contract is
    // unchanged; only the proxy for it was wrong.
    const centroY = (caja: { y: number; height: number }) =>
      caja.y + caja.height / 2;
    expect(Math.abs(centroY(rutaBox) - centroY(volverBox))).toBeLessThan(4);
    // The h1 sits on its own line below that row.
    expect(h1Box.y).toBeGreaterThanOrEqual(rutaBox.y + rutaBox.height);
  });

  test('dashboard legend row navigates to /buckets/Deseos?periodo=2026-07 (WDM-06, WCAT-01)', async ({
    page,
  }) => {
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
  }) => {
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
    // The `data-testid="usage-bar"` absence assertion that used to close this
    // test (and the header test above) is gone. It was retired with the bar
    // itself (bucket-detalle-lista-rediseño): once no source file renders
    // that testid, `toHaveCount(0)` can only ever pass — it asserted a string
    // literal against nothing while reading like coverage. The "%/meta and
    // usage bar stay retired" contract has ONE home now, and it is a unit
    // test: `BucketDetalleMesPage.test.tsx`, which pins the absence by
    // CONTENT (`/Meta:/`, `/^\d+% ·/`) and so catches a re-introduction in
    // any shape, testid or not.
  });

  test('cross-bucket reclassify: on /buckets/Necesidades?periodo=2026-07, reclassify to a Deseos categoría → "Movida a Gustos." in role=status, moved row gone after refetch, URL retains ?periodo= (US-055, T-08, D-07/WCAT-04)', async ({
    page,
  }) => {
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
    //
    // reclasificar-bucket-y-categoria-lista-rediseño (Cambio 4): the
    // accessible name now carries the CURRENT selection
    // (`Categoría de {descripcion}: {etiquetaOpcionActual}`), not a static
    // string. Pinned EXACT, suffix included: `CATALOGO_FIXTURE` ya define
    // `cat-paseos`, así que la etiqueta resuelve a la categoría real de la
    // fila. Una revisión anterior matcheaba sólo el prefijo porque el
    // catálogo no tenía esa entrada y el sufijo caía al texto de respaldo —
    // ese hueco de fixture está cerrado, y con él la razón para aflojar el
    // assert. Si vuelve a abrirse, este `getByLabel` se pone rojo, que es
    // exactamente lo que queremos que pase.
    const select = page.getByLabel('Categoría de Uber: Gustos · Paseos');
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

  // ── Descripción completa (2026-09-17) ───────────────────────────────────
  //
  // This one has to be an e2e, and it has to set its own text.
  //
  // jsdom performs NO layout: `GrupoMovimientos.test.tsx` can assert that the
  // class list says `break-words` and not `truncate`, but it can never
  // measure whether a name actually fits, wraps, or gets cut. Only a real
  // engine can.
  //
  // And every descripción in `api-stubs.ts` is short ('Uber', 'Metro',
  // 'Taxi'): at any of the three viewports they all fit on one line, so a
  // harness running against those fixtures stays green whether the cell
  // truncates or not. It would be a test that cannot fail. Hence the text is
  // written into the cell here — what is under test is the CSS contract of
  // that cell, and the DTO takes no part in deciding whether text is cut.
  test('una descripción más larga que su columna se muestra completa, envolviendo sin desarmar la rejilla', async ({
    page,
  }) => {
    const NOMBRE_LARGO =
      'Transferencia a Juan Pérez por arriendo de departamento agosto 2026 más gastos comunes';

    await page.goto('/buckets/Necesidades?periodo=2026-07');
    // Paseos starts collapsed (bucket-detalle-acordeon) and its rows are
    // inert while hidden — expand before measuring anything.
    const tituloPaseos = page.getByRole('heading', { name: /Paseos/ });
    await expect(tituloPaseos).toBeVisible();
    await tituloPaseos.getByRole('button').click();

    const celda = page.getByText('Uber', { exact: true });
    await expect(celda).toBeVisible();

    // One single `evaluate`: a Playwright locator is lazy and re-queries on
    // every use, so `getByText('Uber')` stops resolving the moment the text
    // is replaced. Measure before, write, and measure after, all inside the
    // page — reading a layout property right after the write forces the
    // reflow, so the second set of numbers is the post-wrap geometry.
    const medidas = await celda.evaluate((el, texto) => {
      const unaLinea = el.clientHeight;
      el.textContent = texto;
      return {
        unaLinea,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      };
    }, NOMBRE_LARGO);
    const unaLinea = medidas.unaLinea;

    // 1 · Not cut horizontally. A `truncate` cell reports a `scrollWidth`
    //     larger than its `clientWidth` — that gap IS the hidden text.
    expect(medidas.scrollWidth).toBeLessThanOrEqual(medidas.clientWidth + 1);

    // 2 · It wrapped rather than shrank: the cell is now taller than the one
    //     line it was. Together with (1) this is what "the whole name is on
    //     screen" means — (1) alone would also hold for text that was cut
    //     with `overflow: hidden` and no ellipsis.
    expect(medidas.clientHeight).toBeGreaterThan(unaLinea);

    // 3 · The distribución survives: no page-level horizontal scroll. This
    //     is what `break-words` buys — without it a single unspaced token
    //     widens the column and pushes the grid off-screen.
    const desborde = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(desborde.scrollWidth).toBeLessThanOrEqual(desborde.clientWidth);
  });
});
