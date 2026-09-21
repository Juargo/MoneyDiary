import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAvisoVersion } from '@/lib/use-aviso-version';

/**
 * AvisoVersionNueva (issue #751) — aviso no bloqueante y descartable de que
 * hay una versión nueva del bundle disponible, con una acción para recargar.
 *
 * Montado UNA sola vez en `routes/__root.tsx` (mismo patrón que `UndoToast`)
 * — app-wide, no solo dentro de `_authenticated`: un chunk desactualizado o
 * un deploy nuevo pueden detectarse en `/login` tanto como en cualquier
 * ruta protegida, y `DemoBanner`/`AppShell` no cubren esa pantalla.
 *
 * Nunca recarga por su cuenta (issue #751 "the user may be mid-form") — el
 * botón "Recargar" llama a `onRecargar` (por defecto
 * `window.location.reload`), inyectable para poder espiarlo en tests sin
 * recargar jsdom de verdad.
 *
 * Descarte en memoria (`useState`), igual que `DemoBanner`: este componente
 * vive en la raíz y no se desmonta durante la sesión, así que no hace falta
 * persistir el descarte — si aparece una versión más nueva todavía tras
 * descartar esta, seguirá sin mostrarse hasta la próxima recarga real (mismo
 * trade-off aceptado que `DemoBanner`, YAGNI).
 *
 * A11y (ADR-018): `role="status"` + `aria-live="polite"` (igual que
 * `UndoToast`) — anuncia sin robar el foco, nunca `role="alert"`. El botón
 * de cerrar es un `<button>` real, alcanzable por Tab y accionable con
 * Enter/Espacio sin JS adicional; no es un focus trap (no hay diálogo modal
 * ni `focus()` forzado al montar).
 */
export function AvisoVersionNueva({
  onRecargar = () => window.location.reload(),
}: {
  readonly onRecargar?: () => void;
} = {}) {
  const { nuevaVersionDisponible } = useAvisoVersion();
  const [descartado, setDescartado] = useState(false);

  if (!nuevaVersionDisponible || descartado) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:justify-end">
      <div
        role="status"
        aria-live="polite"
        aria-label="Aviso de versión nueva disponible"
        className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-md"
      >
        <p className="flex-1">
          Hay una nueva versión de MoneyDiary disponible. Puedes recargar para
          actualizar.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" size="sm" onClick={onRecargar}>
            Recargar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cerrar aviso de versión nueva"
            onClick={() => setDescartado(true)}
            className="text-lg leading-none"
          >
            ×
          </Button>
        </div>
      </div>
    </div>
  );
}
