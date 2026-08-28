/**
 * pluralizar — generic two-form "N word" pluraliser (readability round, R2
 * nit: factors out the `${n} ${n === 1 ? singular : plural}` ternary
 * repeated across `ListaIngestas`'s bulk-delete copy).
 *
 * Deliberately generic and parametrized, unlike
 * `configuracion/categorias/plural.ts`'s two NAMED three-form helpers: those
 * each encode a domain-specific zero-form word (e.g. `etiquetaPatrones(0)`
 * → "sin patrones", not "0 patrones") that a generic helper can't express.
 * Every call site this helper replaces only needs the ordinary "N word(s)"
 * shape (0 and n≥2 share the plural form), so one small parametrized
 * function covers all of them without inventing a zero-form irregularity
 * none of them actually have.
 */
export function pluralizar(
  n: number,
  singular: string,
  plural: string,
): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
