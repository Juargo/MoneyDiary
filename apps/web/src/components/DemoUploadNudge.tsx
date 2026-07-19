/**
 * DemoUploadNudge (`upload-cartola-ui`, US-032, CU-07) — non-blocking notice
 * shown only on the upload screen for demo sessions, reminding the user the
 * demo data is temporary and offering a CTA to create a real account.
 *
 * Presentational and prop-driven (mirrors `DemoBanner.tsx`'s style): the
 * caller (`SubirCartola`) decides `esDemo` from route context (design.md
 * Decision 6) — no fetch happens here, and none is needed. Does NOT touch
 * `<DemoBanner>` or import anything from the `demo-trial-mode` change beyond
 * the stable `MeDto.esDemo` shape already threaded by the caller.
 *
 * A11y (ADR-018): `role="status"` with its OWN distinct `aria-label`
 * ("Aviso de subida en modo demo") — deliberately different from both
 * `DemoBanner`'s "Aviso de modo demo" AND `SubirCartola`'s own
 * `aria-live="polite"` state-transition region, so a screen reader
 * announces this nudge as a separate, identifiable region and never
 * conflates it with the upload's own progress announcements (CU-05/CU-07).
 */
export function DemoUploadNudge({ esDemo = false }: { readonly esDemo?: boolean }) {
  if (!esDemo) {
    return null
  }

  return (
    <div
      role="status"
      aria-label="Aviso de subida en modo demo"
      className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <p className="flex-1">Los datos de esta cuenta demo son temporales y se eliminan automáticamente.</p>
      <a
        href="https://moneydiary.cl"
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 rounded-full bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white"
      >
        Crear cuenta
      </a>
    </div>
  )
}
