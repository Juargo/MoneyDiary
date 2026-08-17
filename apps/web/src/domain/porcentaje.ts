/**
 * Etiqueta explícita para "sin porcentaje": un `porcentajeBp: null` (camino
 * sinIngreso) NUNCA debe renderizarse como "0%" — se distingue con este
 * valor centinela para que el componente lo distinga de un 0 real (spec
 * W1-02, MOB-06 en mobile).
 *
 * Extraído de `resumen-view-model.ts` (US-049, design §1.7) para que
 * `semaforo-detalle-view-model.ts` lo comparta sin duplicar la constante ni
 * el helper — `resumen-view-model.ts` re-exporta `SIN_PORCENTAJE_LABEL` para
 * que sus importadores/tests existentes queden intactos.
 */
export const SIN_PORCENTAJE_LABEL = '—';

/**
 * Convierte `porcentajeBp` (basis points, entero seguro como number) a una
 * etiqueta de porcentaje. `null` (camino sinIngreso) mapea a
 * SIN_PORCENTAJE_LABEL, nunca a "0%" — un `0` verdadero sí mapea a "0%".
 * bp/100 es seguro como number: bp ≤ 10000, muy por debajo de 2^53.
 */
export function aPorcentajeLabel(porcentajeBp: number | null): string {
  if (porcentajeBp === null) {
    return SIN_PORCENTAJE_LABEL;
  }
  return `${porcentajeBp / 100}%`;
}
