/**
 * Veredicto del semáforo — hero redesign (2026-08-30). Verbatim port of
 * apps/web/src/domain/veredicto-semaforo.ts (ADR-008/024: no shared package,
 * each client hand-writes its own copy — keep both in sync by hand).
 *
 * Pure presentation
 * phrasing: takes the backend-computed estados verbatim (never recomputed,
 * ADR-024 / spec W2-01) and produces the two-part verdict copy the hero's
 * tinted box renders: a bold `lead` ("Tu veredicto es En peligro.") and a
 * plain `detalle` explaining WHY, naming the buckets that drive the state.
 *
 * The rojo phrasing mirrors the product's highest-risk rule ("la lógica de
 * mayor riesgo"): one bucket out of range defines the whole month even when
 * the others are fine. The copy only DESCRIBES that rule — the decision was
 * already made by the backend's `estadoGlobal`.
 *
 * `nombre` arrives as the UI label (e.g. 'Gustos', resolved by the caller
 * via `ETIQUETA_BUCKET`) — this module stays theme-free (domain never
 * imports `theme/`). Inconsistent data (an estadoGlobal whose buckets don't carry the
 * matching estado, or an empty bucket list) degrades to a self-contained
 * per-estado fallback line instead of phrasing nonsense; an unknown or null
 * estadoGlobal yields no verdict at all (same never-coerce discipline as
 * `resolverEstiloSemaforo`).
 */

export interface BucketVeredicto {
  /** UI label, already resolved by the caller (e.g. 'Gustos', not 'Deseos'). */
  readonly nombre: string;
  /** Wire enum verbatim ('verde' | 'amarillo' | 'rojo'), never recomputed. */
  readonly estado: string | null;
}

export interface VeredictoSemaforo {
  readonly lead: string;
  readonly detalle: string;
}

const LEAD: Record<string, string> = {
  verde: 'Tu veredicto es Muy Saludable.',
  amarillo: 'Tu veredicto es Saludable.',
  rojo: 'Tu veredicto es En peligro.',
};

const DETALLE_FALLBACK: Record<string, string> = {
  verde: 'Tus gastos del mes están dentro del plan.',
  amarillo: 'Vas ajustado este mes; revisa el detalle para no pasarte.',
  rojo: 'Te pasaste del plan este mes; revisa el detalle para ver dónde.',
};

/** 'A' · 'A y B' · 'A, B y C' — Spanish list join. */
function listar(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

function detalleAmarillo(buckets: readonly BucketVeredicto[]): string | null {
  const ajustados = buckets.filter((b) => b.estado === 'amarillo');
  if (ajustados.length === 0) return null;
  const nombres = listar(ajustados.map((b) => b.nombre));
  const verbo = ajustados.length === 1 ? 'va ajustado' : 'van ajustados';
  if (ajustados.length === buckets.length) {
    return `${nombres} ${verbo} este mes.`;
  }
  return `${nombres} ${verbo} este mes; el resto está en rango.`;
}

function detalleRojo(buckets: readonly BucketVeredicto[]): string | null {
  const fuera = buckets.filter((b) => b.estado === 'rojo');
  if (fuera.length === 0) return null;
  const enRango = buckets.filter((b) => b.estado !== 'rojo');
  const nombresFuera = listar(fuera.map((b) => b.nombre));
  if (enRango.length === 0) {
    return `${nombresFuera} quedan fuera de rango este mes.`;
  }
  const nombresEnRango = listar(enRango.map((b) => b.nombre));
  const estarEnRango =
    enRango.length === 1 ? 'está en rango' : 'están en rango';
  const quedarFuera = fuera.length === 1 ? 'queda' : 'quedan';
  const definir = fuera.length === 1 ? 'define' : 'definen';
  return `Aunque ${nombresEnRango} ${estarEnRango}, ${nombresFuera} ${quedarFuera} fuera de rango y ${definir} el estado global de este mes siguiendo la lógica de mayor riesgo.`;
}

export function construirVeredictoSemaforo(
  estadoGlobal: string | null,
  buckets: readonly BucketVeredicto[],
): VeredictoSemaforo | null {
  if (
    !estadoGlobal ||
    !Object.prototype.hasOwnProperty.call(LEAD, estadoGlobal)
  )
    return null;

  let detalle: string | null = null;
  if (estadoGlobal === 'verde' && buckets.length > 0) {
    detalle = `${listar(buckets.map((b) => b.nombre))} están dentro del plan este mes.`;
  } else if (estadoGlobal === 'amarillo') {
    detalle = detalleAmarillo(buckets);
  } else if (estadoGlobal === 'rojo') {
    detalle = detalleRojo(buckets);
  }

  return {
    lead: LEAD[estadoGlobal],
    detalle: detalle ?? DETALLE_FALLBACK[estadoGlobal],
  };
}
