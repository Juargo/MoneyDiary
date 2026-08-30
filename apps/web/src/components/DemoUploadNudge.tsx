/**
 * DemoUploadNudge (`upload-cartola-ui`, US-032, CU-07; copy revised for
 * "preview sí, commit no") — non-blocking notice shown only on the upload
 * screen for demo sessions, set at the START of the flow: it tells the user
 * up front that the picker, preview, and row classification all work in
 * demo mode, but nothing is saved without a real account — so nobody
 * discovers the block only after classifying a full cartola. A second,
 * differently-worded note sits next to the disabled "Agregar transacciones"
 * button itself (`SubirCartola`'s `MENSAJE_DEMO_COMMIT`), for the reader who
 * only notices at that point.
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
import { Button } from '@/components/ui/button';

export function DemoUploadNudge({
  esDemo = false,
}: {
  readonly esDemo?: boolean;
}) {
  if (!esDemo) {
    return null;
  }

  return (
    <div
      role="status"
      aria-label="Aviso de subida en modo demo"
      className="flex items-center justify-between gap-3 rounded-xl border border-warning-border bg-warning px-4 py-2 text-sm text-warning-foreground"
    >
      <p className="flex-1">
        Puedes subir una cartola de prueba y clasificar sus movimientos: los
        datos de esta cuenta demo son temporales y nada se guarda sin una cuenta
        real.
      </p>
      <Button asChild size="sm" className="shrink-0">
        <a
          href="https://moneydiary.cl"
          target="_blank"
          rel="noopener noreferrer"
        >
          Crear cuenta
        </a>
      </Button>
    </div>
  );
}
