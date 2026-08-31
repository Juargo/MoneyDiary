/**
 * DemoUploadNudge (`upload-cartola-ui`, US-032, CU-07; copy revised for
 * "preview sí, commit no") — non-blocking, informational notice shown only
 * on the upload screen for demo sessions, set at the START of the flow: it
 * tells the user up front that the picker, preview, and row classification
 * all work in demo mode, but nothing is saved without a real account — so
 * nobody discovers the block only after classifying a full cartola. A
 * second, differently-worded note sits next to the disabled "Agregar
 * transacciones" button itself (`SubirCartola`'s `MENSAJE_DEMO_COMMIT`), for
 * the reader who only notices at that point. This is informational copy, not
 * a warning — nothing is wrong or at risk, so it renders with the same
 * neutral surface as other informational asides, never a warning color.
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
      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground"
    >
      <p className="flex-1">
        Puedes subir una cartola de prueba y clasificar sus movimientos: los
        datos de esta cuenta demo son temporales y nada se guarda sin una cuenta
        real.
      </p>
      <Button asChild variant="outline" size="sm" className="shrink-0">
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
