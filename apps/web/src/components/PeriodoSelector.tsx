import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { MonthYearPicker } from './MonthYearPicker';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import {
  esMesActual,
  mesAnterior,
  mesCompletoLabel,
  mesSiguiente,
  periodoActualUTC,
} from '@/domain/periodo-anual';

const PERIODO_SELECTOR_ROW_CLASS =
  'mx-auto flex w-full max-w-6xl items-center justify-center gap-3';

/**
 * Prominent top-of-dashboard period header (period-selector-header,
 * WPER-01..07): prev/next month chevrons flanking the formatted label, plus
 * a "Hoy" shortcut. Backed by the route's `periodo` search param (design.md
 * D2 — TanStack Router search params, not zustand). Pure presentational: the
 * container owns `navigate({ search: (prev) => ({ ...prev, periodo }) })`
 * (W1.12) — this component only reports the new `YYYY-MM` value via
 * `onChange`. Props stay verbatim `{ periodo, onChange }` (design.md
 * decision #2) so the existing wiring (ResumenPage, the bucket-reset effect
 * in ResumenScreen) needs no changes.
 *
 * `periodo` undefined (invalid/absent search param) is treated as the
 * current month for both the label and the next/Hoy clamp (design.md
 * decision #4) — the backend already resolves an absent period to "now", so
 * the header stays truthful to what's actually being shown.
 *
 * keyboard-month-navigation (power-user efficiency round, critique
 * round-7 P2): a single `onKeyDown` on the row container (`manejarTecla`)
 * lets ArrowLeft/ArrowRight navigate month when focus is anywhere inside the
 * group (either chevron, or the popover trigger) — not just via a click on
 * the chevrons themselves. Guarded so it never hijacks arrows from the
 * popover: while `abierto`, the handler is a no-op, because
 * `MonthYearPicker`'s content renders through a Radix `Portal` that still
 * bubbles React synthetic events up through this component's tree (portals
 * follow the React fiber tree for event bubbling, not the real DOM
 * position) — without this guard, arrow keys pressed on a month cell inside
 * the open popover would ALSO fire this container's handler and change
 * `efectivo` behind the popover. Also bails on text inputs/selects/
 * contenteditable targets — defensive, since no such control exists in this
 * component today, but the same container handler would otherwise steal
 * arrow-key editing from one if ever added here. Respects the same
 * next-month bound as the "Mes siguiente" button (`enMesActual`); "Mes
 * anterior" stays unbounded, matching `mesAnterior`'s own contract.
 */
export function PeriodoSelector({
  periodo,
  onChange,
}: {
  readonly periodo: string | undefined;
  readonly onChange: (periodo: string) => void;
}) {
  const ahora = new Date();
  const efectivo = periodo ?? periodoActualUTC(ahora);
  const enMesActual = esMesActual(efectivo, ahora);
  // D-01 §9: renamed to `mesActual` — avoids shadowing the `periodoActual()`
  // module-level import from `domain/periodo.ts` if ever added to this file.
  const mesActual = periodoActualUTC(ahora);
  const [abierto, setAbierto] = useState(false);

  function manejarTecla(evento: KeyboardEvent<HTMLDivElement>) {
    if (abierto) return;
    if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;

    const objetivo = evento.target as HTMLElement;
    const esControlDeTexto =
      objetivo.tagName === 'INPUT' ||
      objetivo.tagName === 'SELECT' ||
      objetivo.tagName === 'TEXTAREA' ||
      objetivo.isContentEditable;
    if (esControlDeTexto) return;

    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      onChange(mesAnterior(efectivo));
    } else if (!enMesActual) {
      evento.preventDefault();
      onChange(mesSiguiente(efectivo));
    }
  }

  return (
    // This bare `<div>` carries no role and is not itself interactive — it
    // only delegates ArrowLeft/ArrowRight from whichever real interactive
    // descendant (a `<button>`) already has focus, so it needs neither a
    // click handler nor its own keyboard support to satisfy the rule the
    // normal way. (Not the same disable `InlineConfirm` carries on its own
    // container: that one is `jsx-a11y/no-noninteractive-element-interactions`,
    // justified by its `role="alertdialog"` — a role ESLint's `aria-query`
    // can't resolve to the `widget` superclass. This is the codebase's only
    // `no-static-element-interactions` disable.)
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={PERIODO_SELECTOR_ROW_CLASS} onKeyDown={manejarTecla}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Mes anterior"
        onClick={() => onChange(mesAnterior(efectivo))}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>

      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Cambiar mes y año, actualmente ${mesCompletoLabel(efectivo)}`}
            className="text-xl font-semibold text-foreground"
          >
            {mesCompletoLabel(efectivo)}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <MonthYearPicker
            periodo={efectivo}
            periodoActual={mesActual}
            onSelect={(nuevoPeriodo) => {
              onChange(nuevoPeriodo);
              setAbierto(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Mes siguiente"
        disabled={enMesActual}
        onClick={() => onChange(mesSiguiente(efectivo))}
      >
        <ChevronRight aria-hidden="true" />
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Ir al mes actual"
        disabled={enMesActual}
        onClick={() => onChange(mesActual)}
      >
        Hoy
      </Button>
    </div>
  );
}
