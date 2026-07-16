/**
 * inferirAnios — infiere el año de cada movimiento cuando el statement no lo
 * trae explícito (BancoEstado, Banco de Chile, Santander — BCI sí trae año
 * explícito por fila y no usa este helper, ver design.md decisión #5).
 *
 * Algoritmo: recorre los meses en el orden en que aparecen en el statement;
 * cuando un mes es MENOR al mes anterior, asume que cruzó de diciembre a
 * enero y aumenta el año en 1 (y todo lo que sigue queda en ese año nuevo,
 * hasta el próximo cruce). Meses repetidos o ascendentes no disparan el
 * incremento.
 *
 * Pura — sin I/O, sin conocer pdfjs ni ningún banco en particular.
 */
export function inferirAnios(
  meses: ReadonlyArray<number>,
  anioInicial: number,
): number[] {
  const anios: number[] = [];
  let anioActual = anioInicial;
  let mesPrevio: number | undefined;

  for (const mes of meses) {
    if (mesPrevio !== undefined && mes < mesPrevio) {
      anioActual += 1;
    }
    anios.push(anioActual);
    mesPrevio = mes;
  }

  return anios;
}
