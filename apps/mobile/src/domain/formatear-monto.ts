/**
 * Formatea un monto en pesos chilenos (entero, sin decimales) al estilo local:
 * separador de miles con punto y prefijo "$". El énfasis en dinero de ADR-015
 * también aplica en mobile: los montos se manejan como enteros exactos, nunca
 * como float.
 *
 * Ejemplo de lógica de dominio pura (sin React Native) que se prueba con Jest
 * directo, sin RNTL.
 */
export function formatearMontoCLP(pesos: number): string {
  if (!Number.isInteger(pesos)) {
    throw new Error('El monto en CLP debe ser un entero (sin decimales).');
  }
  const signo = pesos < 0 ? '-' : '';
  const absoluto = Math.abs(pesos).toString();
  const conMiles = absoluto.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${conMiles}`;
}
