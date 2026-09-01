/**
 * CLASE_BOTON_ICONO — área táctil mínima de los botones de sólo-icono
 * (US-043, design.md §1/Q10c CORRECTION, WCTG-13 guarantee 3). `size-6` =
 * 24×24 CSS px = el mínimo de WCAG 2.2 AA SC 2.5.8 (ADR-018). El icono sigue
 * siendo de 18px y NO se redibuja: lo que crece es el área de golpe
 * alrededor de él.
 *
 * Moved up one level from `categorias/estilos.ts` (US-063 D-06):
 * `ConfiguracionLayout` — this file's new sibling — is one level above
 * `categorias/`, and a shared-level file importing INTO a section folder
 * would signal ownership that isn't real (US-043 D-09). Four call sites as
 * of this move — `CategoriaFila.tsx` (edit link, delete button),
 * `PatronFila.tsx` (pattern-row delete), and `BotonVolver.tsx` (this
 * change's new back control) — so `dry`'s three-strike rule was already
 * satisfied before this move; the move only relocates the single source,
 * it does not redefine the value.
 *
 * `jsdom` no hace layout (`getBoundingClientRect()` devuelve ceros), así que
 * el 24×24 real NUNCA se puede afirmar como geometría aquí — este test solo
 * prueba que la constante no fue reducida. Las otras dos capas de la
 * garantía (todo uso lleva esta clase; el pase manual a 360px) viven en las
 * pruebas RTL de cada componente.
 */
export const CLASE_BOTON_ICONO =
  'inline-flex size-6 shrink-0 items-center justify-center rounded';

/**
 * FOCUS_RING — el tratamiento de foco visible de los controles de sólo-icono
 * de esta sección (WCAG 2.2 AA SC 2.4.7).
 *
 * Sube a este archivo en su TERCER uso, que es cuando la regla de tres de
 * `dry` se cumple: `BotonVolver.tsx` lo tenía como constante local, y el
 * lápiz de `CategoriaFila.tsx` no tenía NINGUNO — un `<Link>` de sólo icono
 * sin indicación de foco es un hueco de a11y real, no una preferencia
 * estética. El literal reproduce el idioma que `app-shell/NavItem.tsx` ya
 * había fijado para el chrome de la app; no inventa un cuarto tratamiento.
 */
export const FOCUS_RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring';
