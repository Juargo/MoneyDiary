import { useMe } from '@/api/use-me';
import { ConfiguracionTabs } from './ConfiguracionTabs';
import { PerfilForm } from './PerfilForm';

/**
 * ConfiguracionPage — la composición completa de CA-02 (US-042 design.md
 * §1/Q1a §3 module map): heading, lista de tabs, `PerfilForm`, y la región
 * del aviso de vínculo con Google (dueña de ese estado — Q1b — porque debe
 * sobrevivir al unmount de un diálogo Y a la reescritura de la URL, Q6b).
 *
 * En ESTE PR (#1b) la región del aviso de Google se monta VACÍA — el efecto
 * que lee `?google=` y la escribe vive en `routes/_authenticated/
 * configuracion.tsx` recién en PR #2 (task 6.1). Montarla vacía ahora evita
 * que PR #2 tenga que reestructurar esta página para agregar el seam
 * (design.md "the window between the two PRs").
 *
 * `useMe()` no necesita un switch loading/error aquí (a diferencia de
 * `ResumenPage`): `_authenticated.tsx`'s `beforeLoad` YA primó `['auth-me']`
 * antes de que esta ruta pudiera montar (WCFG-01/03) — `me` ausente no es
 * un estado alcanzable en producción, solo una guarda defensiva.
 *
 * Grid FLUIDO — primera columna fija + panel flexible, SIN tier `md:` (D-08,
 * no-negociable #10 de esta PR): el layout T1 completo (proporciones
 * medidas, stack bajo `lg`) es tarea 6.3, PR #2. No se adelanta acá.
 */
export function ConfiguracionPage() {
  const { data: me } = useMe();

  if (!me) {
    return null;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Editar perfil</h1>
      <div className="mt-6 grid grid-cols-[200px_1fr] gap-8">
        <ConfiguracionTabs />
        <div className="flex flex-col gap-8">
          <PerfilForm me={me} />
          <p aria-live="polite" data-testid="aviso-google" />
        </div>
      </div>
    </div>
  );
}
