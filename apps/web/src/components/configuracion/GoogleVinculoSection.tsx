import { useRef, useState } from 'react';
import type { MeDto } from '@/api/types';
import {
  useDesvincularGoogle,
  useVincularGoogle,
} from '@/api/use-google-vinculo';
import { ConfirmarPasswordDialog } from './ConfirmarPasswordDialog';
import { MENSAJE_DEMO_SOLO_LECTURA, mensajeDeApiError } from './mensajes';

const DESCRIPCION_VINCULAR =
  'Vas a salir de MoneyDiary para autorizar en Google. Los cambios sin guardar se perderán.';
const DESCRIPCION_DESVINCULAR =
  'Vas a desvincular tu cuenta de Google de MoneyDiary. Podrás volver a vincularla cuando quieras.';

/**
 * GoogleVinculoSection — el tercer bloque de CA-02 (US-042 design.md
 * §1/Q1a/Q7c, WCFG-02/WCFG-08/WCFG-12). Dos estados ESTRUCTURALMENTE
 * simétricos, ambos leídos de `me.googleVinculado`:
 * - vinculada: pill verde (`--color-vinculo-activo*`, Q11) `Vinculada:
 *   {me.email}` + `Desvincular`.
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

  function confirmar(passwordActual: string) {
    if (me.googleVinculado) {
      desvincular.mutate(passwordActual, {
        onSuccess: () => {
          setAbierto(false);
          triggerRef.current?.focus();
          onDesvinculado?.();
        },
      });
      return;
    }
    vincular.mutate(passwordActual);
  }

  const pillClase = me.googleVinculado
    ? 'rounded-full bg-vinculo-activo px-3 py-1 text-xs font-semibold text-vinculo-activo-foreground'
    : 'rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground';

  const pillTexto = me.googleVinculado
    ? me.email !== null
      ? `Vinculada: ${me.email}`
      : 'Vinculada'
    : 'No vinculada';

  // `mensajeDeApiError` nunca se llama con `tag: 'unauthorized'` — mismo
  // idioma que `PerfilForm`: un `''` renderizado sería un `role="alert"`
  // vacío. Fuera de alcance de esta tarea interceptar y navegar a `/login`
  // (no requerido por el diseño para este control).
  const errorDialogo =
    mutacionActiva.error !== null && mutacionActiva.error.tag !== 'unauthorized'
      ? mensajeDeApiError(mutacionActiva.error, 'google')
      : null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-slate-700">Cuenta de Google</h2>
      {me.esDemo && (
        <p role="note" className="text-sm text-slate-500">
          {MENSAJE_DEMO_SOLO_LECTURA}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className={pillClase}>{pillTexto}</span>
        <button
          ref={triggerRef}
          type="button"
          onClick={abrir}
          disabled={me.esDemo}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {me.googleVinculado ? 'Desvincular' : 'Vincular con Google'}
        </button>
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
