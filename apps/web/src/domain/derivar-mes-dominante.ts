/**
 * `derivarMesDominante` — peak-end success landing (SubirCartola `exito`
 * state, supersedes D-01's transient render): picks WHICH calendar month's
 * resumen verdict to fetch after a commit, from the ISO-8601 `fecha`s of
 * the just-persisted (non-duplicate) rows already in memory
 * (`CommitIngestaDto.transacciones`). This is presentation-only — month
 * CHOICE, never money or classification math (ADR-024 stays intact; the
 * verdict itself still comes verbatim from `GET /api/resumen`).
 *
 * Mode over the `YYYY-MM` slice of each `fecha` — same TZ-safe string
 * surgery as `aFechaCorta` (`fecha.ts`): no `Date` round-trip, so no UTC/Chile
 * offset drift. A tie breaks toward the MOST RECENT period: `YYYY-MM`
 * zero-padded strings compare lexicographically exactly like they compare
 * chronologically (the same trick `esPeriodoFuturo` relies on in
 * `periodo-anual.ts`).
 *
 * Returns `undefined` for an empty list — e.g. every committed row turned
 * out to be a duplicate omitted at commit-time (D-13 of `us-057-...`). The
 * caller (`SubirCartola`) treats that as "no month to show a verdict for"
 * and degrades the landing gracefully (count + CTA only, no verdict block).
 */
export function derivarMesDominante(
  fechas: ReadonlyArray<string>,
): string | undefined {
  const conteoPorMes = new Map<string, number>();
  for (const fecha of fechas) {
    const periodo = fecha.slice(0, 7);
    conteoPorMes.set(periodo, (conteoPorMes.get(periodo) ?? 0) + 1);
  }

  let mesDominante: string | undefined;
  let mejorConteo = 0;
  for (const [periodo, conteo] of conteoPorMes) {
    const empataYEsMasReciente =
      conteo === mejorConteo &&
      mesDominante !== undefined &&
      periodo > mesDominante;
    if (conteo > mejorConteo || empataYEsMasReciente) {
      mesDominante = periodo;
      mejorConteo = conteo;
    }
  }
  return mesDominante;
}
