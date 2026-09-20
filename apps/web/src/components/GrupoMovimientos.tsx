import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ReclasificarCategoriaControl } from './ReclasificarCategoriaControl';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
import { IconoCategoriaBadge } from './IconoCategoriaBadge';
import { aDiaConSemana, aFechaCorta, aFechaLargaLabel } from '@/domain/fecha';
import { usePendingIds } from '@/lib/undo-manager';
import type { GrupoDetalleMesViewModel } from '@/domain/detalle-bucket-mes-view-model';

/**
 * GrupoMovimientos — one grouped-category section of the bucket detail page
 * (US-053, T-09; rewired for bucket-detalle-lista-rediseño): the group's
 * heading, its rows, and per-row reclassify controls. Pure presentational —
 * receives the already-mapped view-model group and the page's context
 * (`bucketActual`/`periodo`/`periodoLabel` for the per-row controls and the
 * column header).
 *
 * Group subtotal is BigInt-exact by construction (`formatearMontoCLP` in the
 * view-model never touches Number()/parseFloat(), WCAT-02) — this component
 * only renders `subtotalLabel` verbatim.
 *
 * Collapsed-by-default accordion (bucket-detalle-acordeon, WDM-03): the
 * heading itself IS the trigger — same idiom `PreviewMuestra`'s per-date
 * accordion and `MuestraAgrupada`'s per-category accordion already use
 * (heading wraps a `button` with `aria-expanded`/`aria-controls`, a
 * `ChevronDown` that rotates, the panel kept `hidden` — not unmounted —
 * while collapsed; each instance owns its own `expandido` state, since
 * groups render in a `map`). Activating the trigger shows ALL rows of the
 * group — there is no truncation to reopen: an always-open accordion body
 * has nothing left to slice. The `destacar` group (deep-link highlight)
 * starts EXPANDED — everyone else starts collapsed.
 *
 * **Canonical 5-column grid, desktop (`sm:` and up)**
 * (bucket-detalle-lista-rediseño, Cambio 3):
 * `sm:grid-cols-[4.75rem_1fr_6rem_11rem_2.25rem]` — fecha (76px) ·
 * descripción (flex) · monto (96px) · categoría (176px) · acción (36px) —
 * used IDENTICALLY by the heading's own button, the `aria-hidden` column
 * header below it, and every row `<li>`, so the subtotal/conteo in the
 * heading and every cell in every row land in the exact same x position.
 * This is what makes it read as ONE ledger instead of a stack of
 * independently-laid-out rows (the previous `grid-cols-[auto_1fr_auto]` + a
 * second `col-span-3` band per row varied every row's height and never
 * aligned a single column). Every `<li>` has a MINIMUM `sm:min-h-11` (44px)
 * — the WCAG 2.2 SC 2.5.8 touch-target floor for its row controls. It was a
 * FIXED `sm:h-11` until the descripción stopped truncating (2026-09-17): a
 * name that needs a second line now grows ITS row and only its row, while
 * the five columns stay in the same x position, which is what makes this
 * read as one ledger. A minimum never breaks SC 2.5.8 — growing a row keeps
 * its controls above the floor, it cannot push them below it. The popovers
 * are unaffected: `ReclasificarCategoriaControl`'s and
 * `EliminarMovimientoControl`'s confirm/error layers position `absolute`
 * against their OWN `relative` cell, never against the row, so a taller row
 * still anchors them under their control.
 *
 * **Mobile grid, below `sm` (640px)** (mobile-layout hardening,
 * 2026-09-16): the desktop grid above was shipped with ZERO responsive
 * classes — at a 360px/390px viewport its fixed columns (308px+36px gaps in
 * the heading, 384px+48px gaps per row) overflow the page's
 * `mx-auto max-w-4xl p-4` content width outright, collapsing the group name
 * and every row's descripción to zero width. ONE DOM per element, no
 * duplicated `hidden`/`sm:block` markup blocks — only individual cells that
 * are genuinely desktop- or mobile-only ever carry that pair. Below `sm`:
 *   - Heading button: `grid-cols-[1fr_auto]` — name-cell · subtotal. The
 *     conteo span and the trailing blank span are `hidden sm:block` (the
 *     conteo reappears as its own cell in the column header instead, see
 *     below) — this changes the heading's ACCESSIBLE NAME on mobile
 *     (`display:none` removes a node from the accessible-name computation),
 *     deliberately: the conteo is still announced, just via the column
 *     header's cell, not the heading.
 *   - Column header (`aria-hidden`): `flex justify-between` with only
 *     `{periodoLabel}` and a new trailing `sm:hidden` conteo cell visible;
 *     Descripción/Monto/Categoría/blank are `hidden sm:block` and become
 *     `sm:grid` cells again at `sm:`.
 *   - Row `<li>`: `grid-cols-[3.5rem_1fr_5.25rem]` (fecha · descripción ·
 *     monto) at a MINIMUM `min-h-16` (two text lines' worth — same floor and
 *     same reason as `sm:min-h-11` above; a long descripción grows past it
 *     instead of being cut), with
 *     categoría/acción moved to an implicit second row via
 *     `col-start`/`row-start` (see next paragraph) rather than duplicated
 *     markup.
 *
 * The heading's own button drops the trailing chevron in favor of one right
 * after the group name — the two right-hand cells that used to be chevron
 * territory now carry the subtotal (aligned under the Monto column) and the
 * conteo (aligned under the Categoría column, desktop only — see mobile
 * grid above), with a trailing empty cell reserving the Acción column.
 * Collapsed headings additionally get a `border-b` of their own, so a
 * closed group still reads as one ledger line even with its body `hidden`.
 *
 * The `aria-hidden` column header (periodoLabel · Descripción · Monto ·
 * Categoría · blank, desktop; periodoLabel · conteo, mobile) says the
 * month/year ONCE for the whole list — every row used to have no
 * equivalent, and days/descriptions/amounts had no labeled column at all.
 * `aria-hidden` because this is a `<ul>`, not a `<table>`: without table
 * semantics a screen reader would announce four loose words with nothing to
 * associate them to (the `sr-only` per-row date label below carries the
 * real per-row semantics instead). Hidden together with the `<ul>` when the
 * group is collapsed — same belt-and-braces `hidden` attribute + class
 * pattern as the `<ul>` itself.
 *
 * **Categoría/acción cell placement, mobile vs. desktop**: the call site
 * (this component, not `ReclasificarCategoriaControl` or
 * `EliminarMovimientoControl` themselves — neither accepts nor should
 * accept a `className` prop, so each is wrapped in a positioning `<div>`
 * here) moves those two cells with `col-start`/`row-start` instead of
 * duplicating the row's markup: mobile `col-start-2 row-start-2` /
 * `col-start-3 row-start-2 justify-self-end`, desktop
 * `sm:col-start-4 sm:row-start-1` / `sm:col-start-5 sm:row-start-1
 * sm:justify-self-auto`. Column 1/row 2 is deliberately left empty on
 * mobile — that's what sinks the categoría select down to align under the
 * descripción cell above it. The non-manual row's empty filler `<span />`
 * (see below) carries the same position classes as the delete trigger's
 * wrapper so the grid stays aligned whether or not a row has a delete
 * control.
 *
 * Delete affordance (SDD `correccion-movimientos-manuales` PR 3, WEB-DEL-01,
 * D-03): `EliminarMovimientoControl` renders only for rows with
 * `origen === 'Manual'` — every other row reserves the Acción column with an
 * empty `<span />` so the grid columns stay aligned across rows. It renders
 * `compacto` here (icon-only, `GrupoMovimientos`-only styling —
 * `IngresosMesTable` never passes it, so that screen's rendering is
 * untouched). `tx.fecha` arrives as a RAW ISO string on this view-model
 * (WDM-03) — the visible fecha COLUMN now goes through `aDiaConSemana`
 * (day + weekday abbreviation, both `aria-hidden`, plus an `sr-only` full
 * date via `aFechaLargaLabel`); the delete control's own `fechaLabel` prop
 * still goes through `aFechaCorta` (its confirm dialog keeps the short
 * `YYYY-MM-DD` form — unrelated surface, unrelated formatting need).
 * Success/failure is not announced here; the parent page owns the
 * `role="status"` region (`onEliminado` bubbles up to it, same as
 * `onMovida`).
 *
 * Undo grace window (design-hardening change, resolves critique P1):
 * `EliminarMovimientoControl` schedules a delayed commit and closes its
 * dialog immediately instead of removing anything itself — THIS component
 * hides the row, filtering `grupo.transacciones` by `usePendingIds()`
 * (`lib/undo-manager.ts`) before rendering the row list, so what's visible
 * behind the accordion stays consistent with what's actually pending.
 * `grupo.subtotalLabel`/`conteo` (the group heading) are untouched — those
 * are computed server-side and recompute only after the real DELETE
 * commits (ADR-024).
 */
export function GrupoMovimientos({
  grupo,
  destacar,
  bucketActual,
  periodo,
  periodoLabel,
  onMovida,
  onPatronCreado,
  onEliminado,
  esDemo = false,
}: {
  readonly grupo: GrupoDetalleMesViewModel;
  readonly destacar: boolean;
  readonly bucketActual: string;
  readonly periodo: string | undefined;
  readonly periodoLabel: string;
  /** Bubbles straight up to `ReclasificarCategoriaControl`'s `onMovida` (see its own JSDoc for the cross-bucket/same-bucket label contract). */
  readonly onMovida: (label: string) => void;
  /** Bubbles straight up to `ReclasificarCategoriaControl`'s `onPatronCreado` (issue #745) — fires once the "patrón desde movimiento" offer actually saves a pattern. */
  readonly onPatronCreado?: (patron: string) => void;
  readonly onEliminado?: () => void;
  readonly esDemo?: boolean;
}) {
  // Initial state comes from `destacar`, not a hardcoded `false`: the
  // highlighted deep-link target starts open, every other group starts
  // closed (WDM-03/WDM-04). `useState` only reads this once — a LATER
  // `destacar` flip (there isn't one on this page today) would not reopen
  // an already-mounted group, same as any other lazy-init state.
  const [expandido, setExpandido] = useState(destacar);
  const idLista = useId();
  const idTitulo = useId();
  const pendientes = usePendingIds();

  const transaccionesVisibles = grupo.transacciones.filter(
    (tx) => !pendientes.has(tx.id),
  );

  return (
    <section
      data-testid="grupo-movimientos"
      data-destacado={destacar ? 'true' : undefined}
      aria-labelledby={idTitulo}
      aria-current={destacar ? 'true' : undefined}
      className={
        destacar
          ? 'flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3'
          : 'flex flex-col gap-3'
      }
    >
      {/* The heading wraps the accordion trigger button (whole-row hit
          target, WCAG 2.2 SC 2.5.8), same idiom as `PreviewMuestra`'s date
          groups / `MuestraAgrupada`'s category groups:
          `aria-expanded`/`aria-controls`, a rotating `ChevronDown`
          (`aria-hidden`, `motion-reduce:transition-none`) — now placed
          immediately after the group name instead of trailing the whole
          button, since the button's right-hand cells carry the subtotal and
          conteo (canonical grid, see docblock above). The heading's
          ACCESSIBLE NAME has no middots between nombre/subtotal/conteo on
          desktop (`"Supermercado $412.900 6 movimientos"`, not
          `"Supermercado · $412.900 · 6 movimientos"`) — WCAG 2.5.3 Label in
          Name never required the separators, and dropping them keeps the
          announced name closer to a natural sentence. On MOBILE the conteo
          span is `hidden sm:block` (mobile grid, see docblock above), so the
          accessible name there is shorter (`"Supermercado $412.900"`) —
          deliberate: the conteo is still announced via the column header's
          own mobile cell below, just not as part of this heading.

          Collapsed heading gets its own `border-b`: with the `<ul>` (and its
          own top divider) hidden, a closed group needs to read as one
          ledger line on its own. */}
      <h2
        id={idTitulo}
        className={
          expandido
            ? 'text-sm font-medium text-foreground'
            : 'border-b border-border pb-2 text-sm font-medium text-foreground'
        }
      >
        <button
          type="button"
          aria-expanded={expandido}
          aria-controls={idLista}
          onClick={() => setExpandido((v) => !v)}
          className="grid min-h-10 w-full grid-cols-[1fr_auto] items-center gap-x-2 rounded-md text-left hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-[1fr_6rem_11rem_2.25rem] sm:gap-x-3"
        >
          {/* categoria-iconografia (WDM-03, CATICO-06): the badge's fill is
              the PAGE's bucket (`bucketActual`), not a per-group bucket —
              this page already scopes every group to the same bucket. The
              synthetic Sin categoría group's `icono` is always `null`
              server-side (MBD-02), so `IconoCategoriaBadge` renders the
              generic fallback for it with no client-side special-casing. */}
          <span className="flex min-w-0 items-center gap-2.5">
            <IconoCategoriaBadge icono={grupo.icono} bucket={bucketActual} />
            <span className="min-w-0 break-words">{grupo.nombre}</span>
            <ChevronDown
              aria-hidden="true"
              className={`size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${
                expandido ? '' : '-rotate-90'
              }`}
            />
          </span>{' '}
          <span className="text-right font-mono text-sm font-medium tabular-nums text-foreground">
            {grupo.subtotalLabel}
          </span>{' '}
          {/* Desktop-only: on mobile the conteo is announced via the column
              header's own cell instead (see below). */}
          <span className="hidden text-xs text-muted-foreground sm:block">
            {grupo.conteo} {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
          </span>
          <span className="hidden sm:block" />
        </button>
      </h2>
      {/* `aria-hidden` column header (see docblock above for why): says the
          month/year ONCE for the whole group, right above the row list.
          Hidden alongside the `<ul>` on collapse — same belt-and-braces
          `hidden` attribute + class pattern the `<ul>` already used. */}
      <div
        aria-hidden="true"
        hidden={!expandido}
        className={
          expandido
            ? 'flex items-center justify-between border-b border-border py-1.5 text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase sm:grid sm:grid-cols-[4.75rem_1fr_6rem_11rem_2.25rem] sm:justify-normal sm:gap-x-3'
            : 'hidden'
        }
      >
        <span className="font-mono tracking-[0.08em]">{periodoLabel}</span>
        <span className="hidden sm:block">Descripción</span>
        <span className="hidden text-right sm:block">Monto</span>
        <span className="hidden sm:block">Categoría</span>
        <span className="hidden sm:block" />
        {/* Mobile-only: the desktop conteo cell lives in the heading button
            instead (see above) — `justify-between` pairs this with
            periodoLabel as the only two visible children below `sm`. */}
        <span className="sm:hidden">
          {grupo.conteo} {grupo.conteo === 1 ? 'movimiento' : 'movimientos'}
        </span>
      </div>
      {/* Collapsed = `hidden`, NOT unmounted: a row's mid-cascade control
          state (`ReclasificarCategoriaControl`'s open confirm dialog,
          `EliminarMovimientoControl`'s pending state) would be lost on
          remount. Tailwind v4's preflight makes `[hidden]` win over the
          `divide-y`/grid utilities (`!important`), and the class swap below
          is belt-and-braces for it (PreviewMuestra precedent). */}
      <ul
        id={idLista}
        hidden={!expandido}
        className={
          expandido ? 'divide-y divide-accent border-b border-border' : 'hidden'
        }
      >
        {transaccionesVisibles.map((tx) => {
          const { dia, diaSemana } = aDiaConSemana(tx.fecha);
          return (
            <li
              key={tx.id}
              className="grid min-h-16 grid-cols-[3.5rem_1fr_5.25rem] items-center gap-x-2 gap-y-0.5 py-1.5 text-sm hover:bg-accent sm:min-h-11 sm:grid-cols-[4.75rem_1fr_6rem_11rem_2.25rem] sm:gap-x-3"
            >
              {/* Mono + tabular-nums so dates form a rigid column
                  (DESIGN.md: mono is mandatory for every figure, date and
                  amount). The `sr-only` full date is a real improvement over
                  the raw ISO timestamp this column used to print — a screen
                  reader now hears "3 de agosto de 2026" instead of
                  "2026-08-03T00:00:00.000Z". */}
              <span className="flex items-baseline gap-1.5">
                <span className="sr-only">{aFechaLargaLabel(tx.fecha)}</span>
                <span
                  aria-hidden="true"
                  className="font-mono text-sm font-normal tabular-nums text-foreground"
                >
                  {dia}
                </span>
                <span
                  aria-hidden="true"
                  className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
                >
                  {diaSemana}
                </span>
              </span>
              <span className="break-words text-foreground">
                {tx.descripcion}
              </span>
              {/* `text-right` + `tabular-nums` on a content-width column:
                  the digits line up across rows, so magnitudes are
                  comparable by eye without reading a single number. */}
              <span className="text-right font-mono font-normal tabular-nums text-foreground">
                {tx.montoLabel}
              </span>
              {/* Mobile: sinks to row 2 under the descripción column (col 1,
                  row 2 stays deliberately empty). Desktop: back to its
                  canonical column 4, row 1. Positioning lives HERE (the call
                  site), not inside `ReclasificarCategoriaControl` — it takes
                  no `className` prop and should not know about the grid that
                  contains it. */}
              <div className="col-start-2 row-start-2 sm:col-start-4 sm:row-start-1">
                <ReclasificarCategoriaControl
                  transaccionId={tx.id}
                  descripcion={tx.descripcion}
                  montoLabel={tx.montoLabel}
                  bucketActual={bucketActual}
                  categoriaActual={
                    grupo.categoriaId === null
                      ? null
                      : { id: grupo.categoriaId, nombre: grupo.nombre }
                  }
                  periodo={periodo}
                  onMovida={onMovida}
                  onPatronCreado={onPatronCreado}
                />
              </div>
              {/* Same mobile/desktop repositioning as the categoría cell
                  above, for the same reason — `EliminarMovimientoControl`
                  also takes no `className` prop. The non-manual row's empty
                  filler `<span />` carries the SAME position classes so the
                  grid stays aligned whether or not a row has a delete
                  control (previously it just reserved column 5 by DOM
                  order; now that categoría/acción are explicitly
                  positioned, the filler must be explicit too). */}
              {tx.origen === 'Manual' ? (
                <div className="col-start-3 row-start-2 justify-self-end sm:col-start-5 sm:row-start-1 sm:justify-self-auto">
                  <EliminarMovimientoControl
                    id={tx.id}
                    fechaLabel={aFechaCorta(tx.fecha)}
                    descripcion={tx.descripcion}
                    montoLabel={tx.montoLabel}
                    esDemo={esDemo}
                    compacto
                    onEliminado={onEliminado}
                  />
                </div>
              ) : (
                <span className="col-start-3 row-start-2 justify-self-end sm:col-start-5 sm:row-start-1 sm:justify-self-auto" />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
