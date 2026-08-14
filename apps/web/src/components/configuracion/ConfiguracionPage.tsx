import { useMe } from '@/api/use-me';
import { ConfiguracionTabs } from './ConfiguracionTabs';
import { PerfilForm } from './perfil/PerfilForm';
import { GoogleVinculoSection } from './perfil/GoogleVinculoSection';
import type { Mensaje } from './perfil/mensajes';

/**
 * ConfiguracionPage — la composición completa de CA-02 (US-042 design.md
 * §1/Q1a §3 module map): heading, lista de tabs, `PerfilForm`,
 * `GoogleVinculoSection` (tercer bloque, PR #2 task 5.6), y las regiones del
 * aviso de vínculo con Google.
 *
 * `avisoGoogle`/`onAvisoGoogleChange` llegan por PROPS — el estado en sí
 * (captura de `?google=`, el efecto de limpieza de la URL) vive en
 * `routes/_authenticated/configuracion.tsx` (design.md §1/Q6b, task 6.1);
 * esta página solo RENDERIZA el valor y reenvía el setter hacia
 * `GoogleVinculoSection` para las dos coordinaciones (Q1c/Q6b):
 * `onAbrirDialogo` limpia el aviso al abrir un diálogo de Google (para que
 * un "Vinculaste tu cuenta" viejo nunca quede al lado de un fallo fresco), y
 * `onDesvinculado` lo LLENA con el mensaje de éxito de desvincular — ambos
 * usan el mismo slot de estado que el retorno `?google=`, porque los dos son
 * "el aviso de vínculo con Google", el mismo concepto (Q1b).
 *
 * Dos regiones, no una (mismo idioma que `PerfilForm`'s Q7d): `aviso-google`
 * (`aria-live="polite"`, tono ok) y `aviso-google-error` (`role="alert"`,
 * tono error) — `?google=error` necesita tono alert, así que una sola región
 * `aria-live="polite"` no alcanza.
 *
 * `useMe()` no necesita un switch loading/error aquí (a diferencia de
 * `ResumenPage`): `_authenticated.tsx`'s `beforeLoad` YA primó `['auth-me']`
 * antes de que esta ruta pudiera montar (WCFG-01/03) — `me` ausente no es
 * un estado alcanzable en producción, solo una guarda defensiva.
 *
 * Grid FLUIDO (CA-04, task 6.3, D-08): `max-w-*` + un `grid` de primera
 * columna fija — reproduce las proporciones de T1 en el ancho de T1 y en
 * todo ancho intermedio, sin un tier `md:` nuevo. El único breakpoint es
 * `lg` — el MISMO que ya usa el shell para Sidebar↔BottomTabs
 * (`layout.ts`'s `SIDEBAR_CONTENT_OFFSET_CLASS = 'lg:pl-64'`), no uno
 * inventado para esta página. Debajo de `lg` las dos columnas se APILAN en
 * una sola (heading+tabs arriba del panel) — el `Sidebar` ya cedió su lugar
 * a `BottomTabs` ahí, así que esta página se queda con el ancho completo.
 * `AppShell`/`Sidebar.tsx`/`BottomTabs.tsx` permanecen intactos.
 */
export function ConfiguracionPage({
  avisoGoogle,
  onAvisoGoogleChange,
}: {
  readonly avisoGoogle?: Mensaje;
  readonly onAvisoGoogleChange?: (mensaje: Mensaje | undefined) => void;
} = {}) {
  const { data: me } = useMe();

  if (!me) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-slate-900">Editar perfil</h1>
      <div
        data-testid="configuracion-grid"
        className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]"
      >
        <ConfiguracionTabs />
        <div className="flex flex-col gap-8">
          <PerfilForm me={me} />
          <GoogleVinculoSection
            me={me}
            onAbrirDialogo={() => onAvisoGoogleChange?.(undefined)}
            onDesvinculado={() =>
              onAvisoGoogleChange?.({
                tono: 'ok',
                lineas: ['Desvinculaste tu cuenta de Google.'],
              })
            }
          />
          <div
            aria-live="polite"
            data-testid="aviso-google"
            className="text-sm text-emerald-700"
          >
            {avisoGoogle?.tono === 'ok' &&
              avisoGoogle.lineas.map((linea, indice) => (
                <p key={indice}>{linea}</p>
              ))}
          </div>
          <div
            role="alert"
            data-testid="aviso-google-error"
            className="text-sm text-red-600"
          >
            {avisoGoogle?.tono === 'error' &&
              avisoGoogle.lineas.map((linea, indice) => (
                <p key={indice}>{linea}</p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
