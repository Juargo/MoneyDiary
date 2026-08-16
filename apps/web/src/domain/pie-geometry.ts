/**
 * Pure SVG pie geometry — DOM port of
 * `apps/mobile/src/domain/pie-geometry.ts` (verbatim: the arc math never
 * touched `react-native-svg`, only its consumer did). Angles are degrees
 * measured CLOCKWISE from the top (12 o'clock), matching the mockup's
 * orientation.
 */

export interface Tramo {
  readonly inicio: number;
  readonly fin: number;
}

/**
 * Turns fractions (0..1) into cumulative [inicio, fin] degree ranges. The last
 * tramo is forced to close at exactly 360 so the pie never leaves a hairline
 * gap when the fractions don't sum to 1 (BigInt ratios truncate).
 */
export function calcularAngulos(fracciones: ReadonlyArray<number>): Tramo[] {
  const tramos: Tramo[] = [];
  let acumulado = 0;
  fracciones.forEach((fraccion, i) => {
    const inicio = acumulado;
    const esUltima = i === fracciones.length - 1;
    const fin = esUltima ? 360 : acumulado + fraccion * 360;
    tramos.push({ inicio, fin });
    acumulado = fin;
  });
  return tramos;
}

function puntoEnCirculo(cx: number, cy: number, r: number, anguloDeg: number) {
  const rad = (anguloDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * SVG path `d` for a single pie wedge from `inicio` to `fin` (degrees). A full
 * 360° sweep can't be drawn with one arc (start == end), so it's split into two
 * half-circle arcs. `large-arc-flag` is 1 when the wedge spans more than 180°.
 *
 * `rInterior` (US-047, design D-01) is a TRAILING OPTIONAL parameter — the
 * donut hole radius, in absolute px, `0` by default. `rInterior === 0`
 * returns the exact same string this function always returned (byte-for-byte
 * regression contract, `pie-geometry.test.ts`). `rInterior > 0` draws an
 * annular wedge instead: outer arc forward, a straight line inward, then the
 * inner arc BACKWARD (inverted sweep flag) before closing — the wedge starts
 * at the outer boundary, never at `M cx cy`. The full-360° branch mirrors
 * this with two independent subpaths (outer circle forward, inner circle
 * with the opposite sweep flag) so the default non-zero fill rule punches
 * the hole — without it, a single bucket holding 100% of spend would render
 * a filled disc instead of a ring. `rInterior` is clamped to `[0, r)`: a
 * value at or above `r` degrades to the filled wedge instead of emitting an
 * inverted, self-crossing path — degrade, never throw (same discipline as
 * `montoSeguro`).
 */
export function arcoPath(
  cx: number,
  cy: number,
  r: number,
  inicio: number,
  fin: number,
  rInterior = 0,
): string {
  const barrido = fin - inicio;
  const rInt = rInterior >= r ? 0 : Math.max(rInterior, 0);

  if (barrido >= 359.999) {
    const topExterior = puntoEnCirculo(cx, cy, r, 0);
    const bottomExterior = puntoEnCirculo(cx, cy, r, 180);

    if (rInt <= 0) {
      return (
        `M ${cx} ${cy} L ${redondear(topExterior.x)} ${redondear(topExterior.y)} ` +
        `A ${r} ${r} 0 1 1 ${redondear(bottomExterior.x)} ${redondear(bottomExterior.y)} ` +
        `A ${r} ${r} 0 1 1 ${redondear(topExterior.x)} ${redondear(topExterior.y)} Z`
      );
    }

    const topInterior = puntoEnCirculo(cx, cy, rInt, 0);
    const bottomInterior = puntoEnCirculo(cx, cy, rInt, 180);
    const exterior =
      `M ${redondear(topExterior.x)} ${redondear(topExterior.y)} ` +
      `A ${r} ${r} 0 1 1 ${redondear(bottomExterior.x)} ${redondear(bottomExterior.y)} ` +
      `A ${r} ${r} 0 1 1 ${redondear(topExterior.x)} ${redondear(topExterior.y)} Z`;
    const interior =
      `M ${redondear(topInterior.x)} ${redondear(topInterior.y)} ` +
      `A ${rInt} ${rInt} 0 1 0 ${redondear(bottomInterior.x)} ${redondear(bottomInterior.y)} ` +
      `A ${rInt} ${rInt} 0 1 0 ${redondear(topInterior.x)} ${redondear(topInterior.y)} Z`;
    return `${exterior} ${interior}`;
  }

  const p1Exterior = puntoEnCirculo(cx, cy, r, inicio);
  const p2Exterior = puntoEnCirculo(cx, cy, r, fin);
  const largeArc = barrido > 180 ? 1 : 0;

  if (rInt <= 0) {
    return (
      `M ${cx} ${cy} L ${redondear(p1Exterior.x)} ${redondear(p1Exterior.y)} ` +
      `A ${r} ${r} 0 ${largeArc} 1 ${redondear(p2Exterior.x)} ${redondear(p2Exterior.y)} Z`
    );
  }

  const p1Interior = puntoEnCirculo(cx, cy, rInt, inicio);
  const p2Interior = puntoEnCirculo(cx, cy, rInt, fin);

  return (
    `M ${redondear(p1Exterior.x)} ${redondear(p1Exterior.y)} ` +
    `A ${r} ${r} 0 ${largeArc} 1 ${redondear(p2Exterior.x)} ${redondear(p2Exterior.y)} ` +
    `L ${redondear(p2Interior.x)} ${redondear(p2Interior.y)} ` +
    `A ${rInt} ${rInt} 0 ${largeArc} 0 ${redondear(p1Interior.x)} ${redondear(p1Interior.y)} Z`
  );
}

/**
 * Mid-band radius for the donut ring's on-wedge `%` label — `(r + rInterior)
 * / 2` (design D-01). Today `DistribucionPie` hardcodes `r * 0.62` for label
 * placement; with a hole at `0.58 r` that constant lands inside the hole.
 * Deriving it keeps the label centred in the band for any ratio.
 */
export function radioEtiqueta(r: number, rInterior: number): number {
  return (r + rInterior) / 2;
}
