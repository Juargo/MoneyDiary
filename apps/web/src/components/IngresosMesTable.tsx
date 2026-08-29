import { Badge } from './ui/badge';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
import { usePendingIds } from '@/lib/undo-manager';
import type { IngresosMesViewModel } from '@/domain/ingresos-mes-view-model';

/**
 * IngresosMesTable — US-054 (T-09, D-04): tabla semántica de transacciones de
 * ingresos del mes, renderizada en orden verbatim del wire (MID-01, WDI-06).
 * Primera tabla semántica de la app — accesible vía role="table", <caption
 * className="sr-only"> como accname (D-04), 5 × <th scope="col"> (Fecha,
 * Descripción, Origen, Monto, Acciones). Sin lógica de negocio: solo
 * presentación del view-model (ADR-024).
 *
 * Origen: `<Badge variant="secondary">` — nombre de banco verbatim o
 * `'Manual'` (MID-02, ListaIngestas precedent). Monto: ya formateado con `+`
 * por el view-model (`formatearMontoConSigno(monto, '+')`, MID-05).
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
  filas,
  esDemo = false,
  onEliminado,
}: {
  readonly mes: string;
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
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="pb-2 pr-4">
              Fecha
            </th>
            <th scope="col" className="pb-2 pr-4">
              Descripción
            </th>
            <th scope="col" className="pb-2 pr-4">
              Origen
            </th>
            <th scope="col" className="pb-2 pr-4 text-right">
              Monto
            </th>
            <th scope="col" className="pb-2 text-right">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {filasVisibles.map((fila) => (
            <tr key={fila.id} className="border-b last:border-0">
              <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                {fila.fechaLabel}
              </td>
              <td className="py-2 pr-4 font-medium">{fila.descripcion}</td>
              <td className="py-2 pr-4">
                <Badge variant="secondary">{fila.origen}</Badge>
              </td>
              <td className="py-2 pr-4 text-right font-semibold text-ingreso-foreground">
                {fila.montoLabel}
              </td>
              <td className="py-2 text-right">
                {fila.origen === 'Manual' && (
                  <EliminarMovimientoControl
                    id={fila.id}
                    fechaLabel={fila.fechaLabel}
                    descripcion={fila.descripcion}
                    montoLabel={fila.montoLabel}
                    esDemo={esDemo}
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
