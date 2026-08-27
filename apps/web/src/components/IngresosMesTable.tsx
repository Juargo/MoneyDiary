import { Badge } from './ui/badge';
import type { IngresosMesViewModel } from '@/domain/ingresos-mes-view-model';

/**
 * IngresosMesTable — US-054 (T-09, D-04): tabla semántica de transacciones de
 * ingresos del mes, renderizada en orden verbatim del wire (MID-01, WDI-06).
 * Primera tabla semántica de la app — accesible vía role="table", <caption
 * className="sr-only"> como accname (D-04), 4 × <th scope="col"> (Fecha,
 * Descripción, Origen, Monto). Sin lógica de negocio: solo presentación del
 * view-model (ADR-024).
 *
 * Origen: `<Badge variant="secondary">` — nombre de banco verbatim o
 * `'Manual'` (MID-02, ListaIngestas precedent). Monto: ya formateado con `+`
 * por el view-model (`formatearMontoConSigno(monto, '+')`, MID-05).
 *
 * NO prefetch de catálogo (WDI-06 — sin reclasificación en esta pantalla).
 */
export function IngresosMesTable({
  mes,
  filas,
}: {
  readonly mes: string;
  readonly filas: IngresosMesViewModel['filas'];
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
            <th scope="col" className="pb-2 text-right">
              Monto
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
              <td className="py-2 text-right font-semibold text-ingreso-foreground">
                {fila.montoLabel}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
