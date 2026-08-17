/**
 * Formatea un monto en pesos chilenos (entero, sin decimales) al estilo local:
 * separador de miles con punto y prefijo "$". El énfasis en dinero de ADR-015
 * también aplica en mobile: los montos se manejan como enteros exactos, nunca
 * como float.
 *
 * Firma BigInt-string-safe (MOB-05, design.md B.6): el DTO del backend
 * serializa `totalIngreso`/`total` como string decimal (BigInt-safe), que
 * puede exceder Number.MAX_SAFE_INTEGER. Por eso este formateador opera
 * exclusivamente sobre BigInt + operaciones de string — NUNCA parseFloat ni
 * Number() sobre el monto.
 *
 * Ejemplo de lógica de dominio pura (sin React Native) que se prueba con Jest
 * directo, sin RNTL.
 */
// Regex de formato decimal estricto (US-050, design §1.1 — adoptada de
// apps/web/src/domain/formatear-monto.ts). BigInt(...) por sí solo acepta hex
// ('0x10'), octal ('0o7'), binario ('0b1'), signo '+' explícito y espacios en
// blanco circundantes — ninguno de esos es un monto CLP válido y BigInt() los
// "resuelve" en silencio a un valor numérico distinto (money safety hole).
const FORMATO_DECIMAL_VALIDO = /^-?\d+$/;

/**
 * esMontoStringValido — predicado puro (nunca lanza) que replica el mismo
 * chequeo de formato que `formatearMontoCLP` aplica antes de convertir a
 * `BigInt`. Existe para que los guards de money-safety en `api/client.ts`
 * puedan rechazar un monto malformado ANTES de que el body 2xx llegue a
 * `formatearMontoCLP`/`formatearMontoConSigno` — evita duplicar el regex
 * (DRY) sin envolver los formateadores en un try/catch. Puerto verbatim de
 * apps/web/src/domain/formatear-monto.ts.
 */
export function esMontoStringValido(montoStr: string): boolean {
  return montoStr.trim() !== '' && FORMATO_DECIMAL_VALIDO.test(montoStr);
}

export function formatearMontoCLP(montoStr: string): string {
  // BigInt('') === 0n (no lanza) — caso especial que hay que rechazar a mano.
  // Para el resto (decimales, no-numéricos, hex/oct/bin, signo '+', espacios),
  // se rechaza aquí explícitamente antes de llegar a BigInt(...), cumpliendo
  // el contrato "entero exacto" sin pasar nunca por parseFloat/Number.
  if (!esMontoStringValido(montoStr)) {
    throw new Error(
      'El monto en CLP debe ser un string decimal entero válido (sin hex/oct/bin, sin signo "+", sin espacios).',
    );
  }
  const monto = BigInt(montoStr);
  const signo = monto < 0n ? '-' : '';
  const absoluto = (monto < 0n ? -monto : monto).toString();
  const conMiles = absoluto.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${conMiles}`;
}

/**
 * formatearMontoConSigno — US-050 (design §1.1): una función NUEVA, no un
 * parámetro sobre `formatearMontoCLP` (que se mantiene intacta — se usa en
 * toda la app y agregarle un options bag metería una rama sin uso en cada
 * call site existente). El signo es una decisión del CALLER (elegido por el
 * kind del item — gasto/sinCategoria '-', ingreso '+'), nunca se lee del
 * dato: el backend siempre envía magnitudes sin signo. Puerto verbatim de
 * apps/web/src/domain/formatear-monto.ts.
 */
export function formatearMontoConSigno(
  montoStr: string,
  signo: '+' | '-',
): string {
  if (!esMontoStringValido(montoStr)) {
    throw new Error(
      'El monto en CLP debe ser un string decimal entero válido (sin hex/oct/bin, sin signo "+", sin espacios).',
    );
  }
  const monto = BigInt(montoStr);
  const absoluto = (monto < 0n ? -monto : monto).toString();
  const sinSigno = formatearMontoCLP(absoluto);
  return monto === 0n ? sinSigno : `${signo}${sinSigno}`;
}
