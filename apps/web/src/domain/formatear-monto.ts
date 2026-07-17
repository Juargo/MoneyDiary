/**
 * Formatea un monto en pesos chilenos (entero, sin decimales) al estilo
 * local: separador de miles con punto y prefijo "$". El énfasis en dinero de
 * ADR-015 también aplica en web: los montos se manejan como enteros exactos,
 * nunca como float.
 *
 * Firma BigInt-string-safe (spec W1-01, design.md): el DTO del backend
 * serializa `totalIngreso`/`total` como string decimal (BigInt-safe), que
 * puede exceder Number.MAX_SAFE_INTEGER. Por eso este formateador opera
 * exclusivamente sobre BigInt + operaciones de string — NUNCA parseFloat ni
 * Number() sobre el monto.
 *
 * Puerto verbatim de `apps/mobile/src/domain/formatear-monto.ts` (mismo
 * comportamiento, sin dependencias de React Native) — probado directo con
 * Vitest.
 */
export function formatearMontoCLP(montoStr: string): string {
  // BigInt('') === 0n (no lanza) — caso especial que hay que rechazar a mano.
  // Para el resto (decimales, no-numéricos), BigInt(...) ya lanza, cumpliendo
  // el contrato "entero exacto" sin pasar nunca por parseFloat/Number.
  if (montoStr.trim() === '') {
    throw new Error('El monto en CLP no puede ser un string vacío.')
  }
  const monto = BigInt(montoStr)
  const signo = monto < 0n ? '-' : ''
  const absoluto = (monto < 0n ? -monto : monto).toString()
  const conMiles = absoluto.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}$${conMiles}`
}
