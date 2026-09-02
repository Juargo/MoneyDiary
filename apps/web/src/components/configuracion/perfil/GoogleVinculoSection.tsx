import { useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import type { ApiError } from '@/api/client';
import type { MeDto } from '@/api/types';
import {
  useDesvincularGoogle,
  useVincularGoogle,
} from '@/api/use-google-vinculo';
import { ConfirmarPasswordDialog } from './ConfirmarPasswordDialog';
import { MENSAJE_DEMO_SOLO_LECTURA, mensajeDeApiError } from './mensajes';
import { Button } from '@/components/ui/button';

const DESCRIPCION_VINCULAR =
  'Vas a salir de MoneyDiary para autorizar en Google. Los cambios sin guardar se perderán.';
const DESCRIPCION_DESVINCULAR =
  'Vas a desvincular tu cuenta de Google de MoneyDiary. Podrás volver a vincularla cuando quieras.';

/**
 * GoogleVinculoSection — el tercer bloque de CA-02 (US-042 design.md
 * §1/Q1a/Q7c, WCFG-02/WCFG-08/WCFG-12). Dos estados ESTRUCTURALMENTE
 * simétricos, ambos leídos de `me.googleVinculado`:
 * - vinculada: pill verde (`--color-vinculo-activo*`, Q11) con un ícono
 *   `Check` (`aria-hidden`, decorativo — el texto adyacente ya nombra el
 *   estado) + `Vinculada: {me.email}` + `Desvincular`. El ícono es el
 *   segundo carrier de significado que Q11 exige: el color por sí solo no
 *   puede ser la única señal (WCAG 1.4.1).
 * - no vinculada: pill neutra (`bg-muted`/`text-muted-foreground`) `No
 *   vinculada` + `Vincular con Google`.
 * `me.email === null` estando vinculada (inalcanzable hoy — una cuenta demo
 * nunca puede estar vinculada — pero el render debe ser total) muestra
 * `Vinculada` SIN dos puntos ni dirección (P1, design.md §1).
 *
 * Solo un trigger+diálogo puede existir a la vez (los dos estados son
 * mutuamente excluyentes), así que UN `triggerRef`/`abierto` alcanza — el
 * diálogo compartido (`ConfirmarPasswordDialog`, D-02) no sabe cuál de las
 * dos mutaciones dispara.
 *
 * `onAbrirDialogo` (Q6b, la única regla de coordinación entre las dos
 * regiones de mensaje de la página): se llama SIEMPRE al abrir, antes de
 * `setAbierto(true)`, para que un "Vinculaste tu cuenta de Google." viejo
 * nunca quede al lado de un fallo fresco.
 *
 * Foco: IN → el input de password (dueño: `ConfirmarPasswordDialog`). OUT →
 * este componente, que posee `triggerRef` (mismo idioma que
 * `EliminarIngestaControl`): `cancelar()` y el `onSuccess` de desvincular
 * restauran el foco INCONDICIONALMENTE. El `onSuccess` de vincular NO
 * restaura nada — navega fuera de la app (`useVincularGoogle`), no queda
 * nada a lo que volver (Q7c, "one exception, by nature").
 *
 * Demo (WCFG-07): proactivo — el botón se deshabilita y un `role="note"`
 * reutiliza `MENSAJE_DEMO_SOLO_LECTURA` (la MISMA constante que
 * `PerfilForm`, `dry`) — defensivo: si igual se dispara un submit, el 403
 * `DEMO_SOLO_LECTURA` cae en la misma tabla de `mensajeDeApiError`.
 *
 * **Surface pass (2026-09-01).** El `<h2>Cuenta de Google</h2>` que este
 * componente renderizaba ya NO vive acá: lo posee el `SeccionConfig` que lo
 * envuelve en `PerfilPanel`. El nombre accesible y el nivel del heading no
 * cambian — cambia quién lo emite, para que ninguna sección pueda elegir su
 * propio peso visual (el defecto que se estaba arreglando: tres `h2`
 * hermanos renderizados a dos tamaños distintos). Este componente vuelve a
 * ser solo el control de vínculo.
 *
 * La fila pill+botón gana `flex-wrap`: el pill incluye el email del usuario
 * (`Vinculada: {email}`), así que a 360px un email largo y el botón
 * `Desvincular` no entran juntos en una línea — sin `flex-wrap` el botón se
 * comprimía en vez de bajar de renglón.
 */
export function GoogleVinculoSection({
  me,
  onAbrirDialogo,
  onDesvinculado,
}: {
  readonly me: MeDto;
  readonly onAbrirDialogo?: () => void;
  readonly onDesvinculado?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const navigate = useNavigate();
  const vincular = useVincularGoogle();
  const desvincular = useDesvincularGoogle();
  const mutacionActiva = me.googleVinculado ? desvincular : vincular;

  function abrir() {
    vincular.reset();
    desvincular.reset();
    onAbrirDialogo?.();
    setAbierto(true);
  }

  function cancelar() {
    setAbierto(false);
    triggerRef.current?.focus();
  }

  // WCFG-09's table is not scoped to `PerfilForm` — `tag: 'unauthorized'`
  // navigates to `/login` with no message here too, same as `PerfilForm`'s
  // `enviar`. A session can expire while THIS dialog is pending (link/unlink
  // is no less likely to outlive a session than a profile save).
  function onErrorMutacion(error: ApiError) {
    if (error.tag === 'unauthorized') {
      void navigate({ to: '/login' });
    }
  }

  function confirmar(passwordActual: string) {
    if (me.googleVinculado) {
      desvincular.mutate(passwordActual, {
        onSuccess: () => {
          setAbierto(false);
          triggerRef.current?.focus();
          onDesvinculado?.();
        },
        onError: onErrorMutacion,
      });
      return;
    }
    vincular.mutate(passwordActual, { onError: onErrorMutacion });
  }

  const pillClase = me.googleVinculado
    ? 'inline-flex items-center gap-1 rounded-none bg-vinculo-activo px-3 py-1 text-xs font-semibold text-vinculo-activo-foreground'
    : 'rounded-none bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground';

  const pillTexto = me.googleVinculado
    ? me.email !== null
      ? `Vinculada: ${me.email}`
      : 'Vinculada'
    : 'No vinculada';

  // `mensajeDeApiError` nunca se llama con `tag: 'unauthorized'` — mismo
  // idioma que `PerfilForm`: un `''` renderizado sería un `role="alert"`
  // vacío. `onErrorMutacion` ya interceptó y navegó a `/login` para ese tag,
  // así que este `null` es solo defensivo mientras esa navegación resuelve.
  const errorDialogo =
    mutacionActiva.error !== null && mutacionActiva.error.tag !== 'unauthorized'
      ? mensajeDeApiError(mutacionActiva.error, 'google')
      : null;

  return (
    <div className="flex flex-col gap-3">
      {me.esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_SOLO_LECTURA}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <span className={pillClase}>
          {me.googleVinculado && (
            <Check aria-hidden="true" className="size-3.5" />
          )}
          {pillTexto}
        </span>
        <Button
          ref={triggerRef}
          type="button"
          onClick={abrir}
          disabled={me.esDemo}
        >
          {me.googleVinculado ? 'Desvincular' : 'Vincular con Google'}
        </Button>
      </div>
      {abierto && (
        <ConfirmarPasswordDialog
          titulo={
            me.googleVinculado ? 'Desvincular Google' : 'Vincular con Google'
          }
          descripcion={
            me.googleVinculado ? DESCRIPCION_DESVINCULAR : DESCRIPCION_VINCULAR
          }
          textoConfirmar={me.googleVinculado ? 'Desvincular' : 'Vincular'}
          pendiente={mutacionActiva.isPending}
          error={errorDialogo}
          onConfirmar={confirmar}
          onCancelar={cancelar}
        />
      )}
    </div>
  );
}
