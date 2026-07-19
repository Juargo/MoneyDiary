/**
 * Pure SVG pie geometry — DOM port of
 * `apps/mobile/src/domain/pie-geometry.ts` (verbatim: the arc math never
 * touched `react-native-svg`, only its consumer did). Angles are degrees
 * measured CLOCKWISE from the top (12 o'clock), matching the mockup's
 * orientation.
 */

export interface Tramo {
  readonly inicio: number
  readonly fin: number
}

/**
 * Turns fractions (0..1) into cumulative [inicio, fin] degree ranges. The last
 * tramo is forced to close at exactly 360 so the pie never leaves a hairline
 * gap when the fractions don't sum to 1 (BigInt ratios truncate).
 */
export function calcularAngulos(fracciones: ReadonlyArray<number>): Tramo[] {
  const tramos: Tramo[] = []
  let acumulado = 0
  fracciones.forEach((fraccion, i) => {
    const inicio = acumulado
    const esUltima = i === fracciones.length - 1
    const fin = esUltima ? 360 : acumulado + fraccion * 360
    tramos.push({ inicio, fin })
    acumulado = fin
  })
  return tramos
}

function puntoEnCirculo(cx: number, cy: number, r: number, anguloDeg: number) {
  const rad = (anguloDeg * Math.PI) / 180
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  }
}

function redondear(n: number): number {
  return Math.round(n * 1000) / 1000
}

/**
 * SVG path `d` for a single pie wedge from `inicio` to `fin` (degrees). A full
 * 360° sweep can't be drawn with one arc (start == end), so it's split into two
 * half-circle arcs. `large-arc-flag` is 1 when the wedge spans more than 180°.
 */
export function arcoPath(cx: number, cy: number, r: number, inicio: number, fin: number): string {
  const barrido = fin - inicio

  if (barrido >= 359.999) {
    const top = puntoEnCirculo(cx, cy, r, 0)
    const bottom = puntoEnCirculo(cx, cy, r, 180)
    return (
      `M ${cx} ${cy} L ${redondear(top.x)} ${redondear(top.y)} ` +
      `A ${r} ${r} 0 1 1 ${redondear(bottom.x)} ${redondear(bottom.y)} ` +
      `A ${r} ${r} 0 1 1 ${redondear(top.x)} ${redondear(top.y)} Z`
    )
  }

  const p1 = puntoEnCirculo(cx, cy, r, inicio)
  const p2 = puntoEnCirculo(cx, cy, r, fin)
  const largeArc = barrido > 180 ? 1 : 0

  return (
    `M ${cx} ${cy} L ${redondear(p1.x)} ${redondear(p1.y)} ` +
    `A ${r} ${r} 0 ${largeArc} 1 ${redondear(p2.x)} ${redondear(p2.y)} Z`
  )
}
