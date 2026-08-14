/**
 * CLASE_BOTON_ICONO — área táctil mínima de los botones de sólo-icono
 * (US-043, design.md §1/Q10c CORRECTION, WCTG-13 guarantee 3). `size-6` =
 * 24×24 CSS px = el mínimo de WCAG 2.2 AA SC 2.5.8 (ADR-018). El icono sigue
 * siendo de 18px y NO se redibuja (eso es US-063): lo que crece es el área
 * de golpe alrededor de él.
 *
 * Tres usos — list-row edit y list-row delete (`CategoriaFila.tsx`, este
 * PR), pattern-row delete (`PatronFila.tsx`, PR #4) — así que el "3-strike
 * rule" de `dry` se satisface en la PRIMERA escritura, no en la tercera.
 *
 * `jsdom` no hace layout (`getBoundingClientRect()` devuelve ceros), así que
 * el 24×24 real NUNCA se puede afirmar como geometría aquí — este test solo
 * prueba que la constante no fue reducida. Las otras dos capas de la
 * garantía (todo uso lleva esta clase; el pase manual a 360px) viven en las
 * pruebas RTL de cada componente y en PR #5, task 46.
 */
export const CLASE_BOTON_ICONO =
  'inline-flex size-6 shrink-0 items-center justify-center rounded';
