import { Badge } from './ui/badge';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
import { usePendingIds } from '@/lib/undo-manager';
import type { IngresosMesViewModel } from '@/domain/ingresos-mes-view-model';

/**
 * IngresosMesTable — US-054 (T-09, D-04); rewired for `ingresos-visual-
 * rediseno` to calcar the movimientos-list ledger's visual LANGUAGE
 * (`GrupoMovimientos`/`BucketDetalleMesPage`, bucket-detalle-lista-rediseño)
 * WITHOUT abandoning table semantics — that decision is LOCKED (US-054/D-04):
 * this stays a `<table>`, never a `<ul>` with a CSS grid. Accesible vía
 * role="table", `<caption className="sr-only">` como accname (D-04), 5 ×
 * `<th scope="col">` (Fecha, Descripción, Origen, Monto, Acciones). Sin
 * lógica de negocio: solo presentación del view-model (ADR-024).
 *
 * **Encabezado de columna de Fecha** (`periodoLabel`, required prop): dice el
 * mes/año UNA SOLA VEZ para toda la tabla, igual que la columna de fecha del
 * libro mayor de buckets — pero con una ventaja real sobre esa pantalla: ahí
 * el encabezado tuvo que ir `aria-hidden` porque una `<ul>` no tiene
 * semántica de columna que lo asocie a cada fila (el `sr-only` por fila
 * cargaba solo). Acá el `<th scope="col">` SÍ se anuncia y el navegador lo
 * asocia automáticamente a cada `<td>` de esa columna — se aprovecha la
 * tabla en vez de trabajar en contra de ella.
 *
 * **Celda de fecha**: mismo tratamiento visual que `GrupoMovimientos` — día
 * (`diaLabel`) + abreviatura de día de semana (`diaSemanaLabel`), ambos
 * `aria-hidden`, más un `sr-only` con `fechaLargaLabel` ("3 de julio de
 * 2026"). `fechaLabel` (YYYY-MM-DD corto) NO se renderiza acá — sigue vivo
 * solo como prop de `EliminarMovimientoControl` (su `aria-label`/diálogo).
 *
 * Origen: `<Badge variant="secondary">` — nombre de banco verbatim o
 * `'Manual'` (MID-02, ListaIngestas precedent). Monto: ya formateado con `+`
 * por el view-model (`formatearMontoConSigno(monto, '+')`, MID-05), ahora en
 * `font-mono tabular-nums` (DESIGN.md: mono obligatorio para toda cifra).
 *
 * Alto de fila FIJO (`h-11` en el `<tr>` — un `<tr>` SÍ respeta `height`
 * como piso de su fila en un motor de layout real, aunque jsdom no lo mida;
 * esta es la razón por la que las filas ya no crecían distinto según
 * tuvieran o no botón de eliminar). `EliminarMovimientoControl` se renderiza
 * `compacto` (36×44px, ya calibrado para un `h-11` — Cambio 5, opt-in
 * agregado en `bucket-detalle-lista-rediseño` justo para este momento) — la
 * celda de Acciones SIEMPRE se renderiza, vacía en la fila no-Manual, para
 * que las columnas no se corran entre filas.
 *
 * Separadores: `divide-y divide-accent` entre filas + `border-b border-border`
 * de cierre en el `<tbody>` (mismo idioma que el `<ul>` del libro mayor de
 * buckets). Hover `hover:bg-accent` por fila.
 *
 * **Móvil (pérdida de información deliberada)**: la columna Origen (`<th>` +
 * `<td>`) se oculta por debajo de `sm` (`hidden sm:table-cell`) — a 360px no
 * entran cinco columnas, y Origen es la menos crítica: la fila Manual ya se
 * distingue visualmente por tener el botón de eliminar. El `overflow-x-auto`
 * del wrapper queda como red de seguridad para cualquier ancho aún menor.
 *
 * Acciones (SDD `correccion-movimientos-manuales` PR 3, WEB-DEL-01):
 * `EliminarMovimientoControl` renders ONLY on rows where `origen === 'Manual'`
 * — an ingesta-born row has no delete affordance (the endpoint's own 404
 * anti-enumeration would reject it anyway; hiding the control avoids a dead
 * click). Success/failure is not announced here — the parent page owns a
 * page-level `role="status"` region that survives this control's own
 * unmount, and receives `onEliminado` (mirrors `EliminarIngestaControl` /
 * `ListaIngestas`).
 *
 * NO prefetch de catálogo (WDI-06 — sin reclasificación en esta pantalla).
 *
 * Undo grace window (design-hardening change, resolves critique P1):
 * `EliminarMovimientoControl` no longer removes a row on its own — it
 * schedules a delayed commit and closes its dialog immediately. THIS
 * component is what actually hides the row, filtering `filas` by
 * `usePendingIds()` (the shared `undo-manager.ts` singleton) before
 * rendering — the same reactive id set `UndoToast` reads to show
 * "Deshacer". Amounts/totals elsewhere on the page are untouched by this
 * filter (ADR-024, server stays source of truth for money); only the row
 * itself disappears.
 */
export function IngresosMesTable({
  mes,
  periodoLabel,
  filas,
  esDemo = false,
  onEliminado,
}: {
  readonly mes: string;
  readonly periodoLabel: string;
  readonly filas: IngresosMesViewModel['filas'];
  readonly esDemo?: boolean;
  readonly onEliminado?: () => void;
}) {
  const pendientes = usePendingIds();
  const filasVisibles = filas.filter((fila) => !pendientes.has(fila.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Ingresos de {mes}</caption>
        <thead>
          <tr className="text-left">
            <th
              scope="col"
              className="border-b border-border pb-2 pr-4 font-mono text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              {periodoLabel}
            </th>
            <th
              scope="col"
              className="border-b border-border pb-2 pr-4 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              Descripción
            </th>
            <th
              scope="col"
              className="hidden border-b border-border pb-2 pr-4 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase sm:table-cell"
            >
              Origen
            </th>
            <th
              scope="col"
              className="border-b border-border pb-2 pr-4 text-right text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              Monto
            </th>
            <th
              scope="col"
              className="border-b border-border pb-2 text-right text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-accent border-b border-border">
          {filasVisibles.map((fila) => (
            <tr key={fila.id} className="h-11 hover:bg-accent">
              <td className="pr-4">
                <span className="flex items-baseline gap-1.5">
                  <span className="sr-only">{fila.fechaLargaLabel}</span>
                  <span
                    aria-hidden="true"
                    className="font-mono text-sm font-medium tabular-nums text-foreground"
                  >
                    {fila.diaLabel}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
                  >
                    {fila.diaSemanaLabel}
                  </span>
                </span>
              </td>
              <td
                className="max-w-0 truncate pr-4 font-medium"
                title={fila.descripcion}
              >
                {fila.descripcion}
              </td>
              <td className="hidden pr-4 sm:table-cell">
                <Badge variant="secondary">{fila.origen}</Badge>
              </td>
              <td className="pr-4 text-right font-mono font-semibold tabular-nums text-ingreso-foreground">
                {fila.montoLabel}
              </td>
              <td className="text-right">
                {fila.origen === 'Manual' && (
                  <EliminarMovimientoControl
                    id={fila.id}
                    fechaLabel={fila.fechaLabel}
                    descripcion={fila.descripcion}
                    montoLabel={fila.montoLabel}
                    esDemo={esDemo}
                    compacto
                    onEliminado={onEliminado}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
