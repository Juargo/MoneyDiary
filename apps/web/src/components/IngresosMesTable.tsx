import { Badge } from './ui/badge';
import { EliminarMovimientoControl } from './EliminarMovimientoControl';
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
          {filas.map((fila) => (
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
