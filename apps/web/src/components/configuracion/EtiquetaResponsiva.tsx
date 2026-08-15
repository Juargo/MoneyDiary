/**
 * EtiquetaResponsiva (US-063 D-03, WCTM-06) — the one file that must encode
 * D-01's three viewport bands at once: mobile <768px (`md` inactive),
 * tablet 768–1023px (`md` active, `lg` inactive), desktop ≥1024px (`md` and
 * `lg` both active).
 *
 * CA-05 needs three bands across six strings, at least two of which are
 * genuinely 3-way (the list footer note, and `Nueva categoría`'s
 * non-monotonic mapping — long at desktop, short at tablet, long again at
 * mobile). The shipped two-`<span>` idiom (`lg:hidden` / `hidden lg:inline`)
 * encodes exactly one boolean and cannot express that. This component
 * generalises it to two or three literal-class spans instead.
 *
 * Classes are written **literally** in this file — Tailwind 4 scans
 * literals only (`estilos.ts`'s same constraint):
 *
 * | Band | Class |
 * |---|---|
 * | mobile only | `md:hidden` |
 * | tablet only | `hidden md:inline lg:hidden` |
 * | desktop only | `hidden lg:inline` |
 *
 * When `tablet` is omitted, the component emits two spans instead of three:
 * `md:hidden` (mobile) and `hidden md:inline` (tablet AND desktop share the
 * `escritorio` string — no `lg:hidden` cutoff on the second span) — the
 * 2-band case costs no extra DOM, and there is no third span carrying an
 * empty string.
 *
 * Pure, no React state. `escritorio` is also the canonical string for the
 * accessible name (D-04): every INTERACTIVE control whose visible text is
 * responsive must carry an explicit `aria-label={escritorio}` at its own
 * call site — that rule lives with each consumer, not here, since a
 * non-interactive `<p>` (the footer/zero-patterns notes) must NOT get one
 * (SC 2.5.3 does not reach static prose).
 *
 * CSS-only (D-08) — jsdom cannot prove WHICH band is visible at a real
 * viewport, only that the right strings and classes are emitted for a given
 * input shape. That is Playwright's job (`e2e/list-surface.e2e.ts`).
 */
export type CopiaResponsiva = {
  readonly movil: string;
  /** Omit when tablet shows the desktop string (the four mobile-only shortenings). */
  readonly tablet?: string;
  readonly escritorio: string;
};

export function EtiquetaResponsiva({
  movil,
  tablet,
  escritorio,
}: CopiaResponsiva) {
  if (tablet === undefined) {
    return (
      <>
        <span className="md:hidden">{movil}</span>
        <span className="hidden md:inline">{escritorio}</span>
      </>
    );
  }
  return (
    <>
      <span className="md:hidden">{movil}</span>
      <span className="hidden md:inline lg:hidden">{tablet}</span>
      <span className="hidden lg:inline">{escritorio}</span>
    </>
  );
}
