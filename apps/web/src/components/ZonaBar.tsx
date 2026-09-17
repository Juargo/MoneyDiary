import { cn } from '@/lib/utils';
import type { SegmentoZona } from '@/domain/semaforo-detalle-view-model';

const COLOR_SEGMENTO: Record<SegmentoZona['estado'], string> = {
  verde: 'bg-semaforo-verde-band',
  amarillo: 'bg-semaforo-amarillo-band',
  rojo: 'bg-semaforo-rojo-band',
};

/**
 * ZonaBar — visualiza dónde cae `porcentajeBp` de un bucket dentro de sus
 * bandas Verde/Amarillo/Rojo (US-049, design §1.7, WSEM-03/WSEM-08). A11y
 * contract (ADR-018, WCAG 2.2 AA, mismo house rule que `SemaforoBadge`/
 * `SemaforoTag`): el track coloreado y el marcador son puramente decorativos
 * (`aria-hidden="true"`) — el contenido accesible es texto real (porcentaje,
 * palabra de estado, rango numérico de cada banda), nunca un `role="img"`
 * con una oración sintetizada. `segmentos`/`markerPct` llegan ya calculados
 * desde `semaforo-detalle-view-model.ts` — este componente no hace ninguna
 * aritmética de bandas (R2 — ningún literal de umbral aquí).
 */
export function ZonaBar({
  segmentos,
  markerPct,
  porcentajeLabel,
  estadoLabel,
}: {
  readonly segmentos: ReadonlyArray<SegmentoZona>;
  readonly markerPct: number | null;
  readonly porcentajeLabel: string;
  readonly estadoLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {/* `porcentajeLabel` es una CIFRA, así que va en mono tabular (DESIGN.md
          lo exige para toda cifra, fecha y monto — esta barra no lo cumplía).
          `estadoLabel` NO: es una palabra ("Saludable", "Atención"), y la sans
          es su tipografía correcta. Mismo criterio que usa el libro mayor de
          `/buckets`, donde el nombre de la categoría se queda en sans y sólo
          el subtotal y el conteo pasan a mono. */}
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        <span className="font-mono tabular-nums">{porcentajeLabel}</span>
        <span>{estadoLabel}</span>
      </div>

      <div
        className="relative h-2 w-full"
        data-testid="zona-bar-track"
        aria-hidden="true"
      >
        <div className="flex h-full w-full overflow-hidden rounded-none">
          {segmentos.map((segmento) => (
            <div
              key={`${segmento.estado}-${segmento.desdePct}`}
              className={cn('h-full', COLOR_SEGMENTO[segmento.estado])}
              style={{ width: `${segmento.anchoPct}%` }}
            />
          ))}
        </div>
        {markerPct !== null && (
          <div
            data-testid="zona-bar-marker"
            className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-none bg-foreground"
            style={{ left: `${markerPct}%` }}
          />
        )}
      </div>

      {/* Cada `etiqueta` es un rango puro de cifras (`0–50%`, view-model
          `semaforo-detalle-view-model.ts`), así que la leyenda entera va en
          mono tabular: sin ella los rangos de las tres zonas no alinean sus
          dígitos entre sí. */}
      <ul className="flex flex-wrap gap-x-2 font-mono text-[11px] tabular-nums text-muted-foreground">
        {segmentos.map((segmento) => (
          <li key={`${segmento.estado}-${segmento.desdePct}-label`}>
            {segmento.etiqueta}
          </li>
        ))}
      </ul>
    </div>
  );
}
