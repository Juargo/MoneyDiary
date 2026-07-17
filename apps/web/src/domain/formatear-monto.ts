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
// Regex de formato decimal estricto. BigInt(...) por sí solo acepta hex
// ('0x10'), octal ('0o7'), binario ('0b1'), signo '+' explícito y espacios
// en blanco circundantes — ninguno de esos es un monto CLP válido y
// BigInt() los "resuelve" en silencio a un valor numérico distinto (money
// safety hole). Esta guarda web es intencionalmente más estricta que el
// puerto mobile (`apps/mobile/src/domain/formatear-monto.ts`), que no
// valida el formato antes de llamar a BigInt(...).
const FORMATO_DECIMAL_VALIDO = /^-?\d+$/

export function formatearMontoCLP(montoStr: string): string {
  // BigInt('') === 0n (no lanza) — caso especial que hay que rechazar a mano.
  // Para el resto (decimales, no-numéricos, hex/oct/bin, signo '+', espacios),
  // se rechaza aquí explícitamente antes de llegar a BigInt(...), cumpliendo
  // el contrato "entero exacto" sin pasar nunca por parseFloat/Number.
  if (montoStr.trim() === '' || !FORMATO_DECIMAL_VALIDO.test(montoStr)) {
    throw new Error(
      'El monto en CLP debe ser un string decimal entero válido (sin hex/oct/bin, sin signo "+", sin espacios).',
    )
  }
  const monto = BigInt(montoStr)
  const signo = monto < 0n ? '-' : ''
  const absoluto = (monto < 0n ? -monto : monto).toString()
  const conMiles = absoluto.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}$${conMiles}`
}
