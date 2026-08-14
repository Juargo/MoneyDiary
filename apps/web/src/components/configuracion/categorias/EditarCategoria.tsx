import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useActualizarCategoria } from '@/api/use-actualizar-categoria';
import { useCategorias } from '@/api/use-categorias';
import { useEliminarCategoria } from '@/api/use-eliminar-categoria';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { BucketAsignable } from '@/api/catalogo-constantes';
import type { CategoriaDto } from '@/api/types';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { CampoTexto } from '../CampoTexto';
import { CampoSelect } from './CampoSelect';
import { mensajeDeErrorCatalogo } from './mensajes-catalogo';

const OPCIONES_BUCKET = BUCKETS_ASIGNABLES.map((bucket) => ({
  value: bucket,
  label: ETIQUETA_BUCKET[bucket] ?? bucket,
}));

/**
 * EditarCategoria (US-043 PR #3b, design.md §1/Q1d/Q1e, WCTG-01, WCTG-10)
 * — CA-02, the edit screen. Resolves its category by `id` out of the
 * single `['categorias']` query — there is no `GET /api/categorias/:id`
 * (§1/Q1e/Q2c: one key serves the list, this screen, and the reclassify
 * dropdown, §7).
 *
 * Four reachable states (§1/Q1e):
 * - query pending → `role="status"` "Cargando…"
 * - query error → `mensajeDeErrorCatalogo(error)` in `role="alert"` + a
 *   "Volver a Categorías" link
 * - ok, id present → `EditarCategoriaCargada` (below) — the real screen
 * - ok, id ABSENT → `role="status"` "Esa categoría ya no existe." + link
 *   (a stale deep link or a row deleted from another tab/session is not a
 *   failure of the action the user just took, hence `status` not `alert`)
 *
 * **Why the identity form's state lives in a CHILD component
 * (`EditarCategoriaCargada`), not here**: this component's hook order must
 * stay identical across every render regardless of which of the four
 * states is active (pending → error → ok are all reachable from the SAME
 * mounted instance as `['categorias']` resolves/refetches). `nombre`/
 * `bucket` `useState` can only exist once a `categoria` is resolved, so it
 * is pushed into a component that only mounts once that precondition holds
 * — a normal mount/unmount, not a conditional hook call.
 *
 * The edit route escapes `ConfiguracionLayout` (the trailing-underscore
 * segment, §1/Q1b) and so inherits NO heading/chrome from it — this
 * component renders its OWN `h1`/breadcrumb (§1/Q1d), unlike `PerfilPanel`/
 * `CategoriasPanel` which render inside the shared layout's `h1`.
 *
 * **The in-flight-delete guard** (§1/Q1e "the trap"): after a successful
 * delete FROM this screen, profile B invalidation refetches `['categorias']`
 * (the row is now gone) while this component is STILL mounted, one tick
 * before the mutate-level `onSuccess` (task 34) navigates away — React
 * Query runs the hook-level `onSuccess` (invalidate) BEFORE the
 * mutate-level one (navigate), so ordering alone does not fix it. Without
 * this guard, "Esa categoría ya no existe." would flash false for those two
 * ticks. `eliminacion` is created HERE, not in the child, so the SAME hook
 * instance backs both the guard and (from task 34) the footer's delete
 * trigger — `useMutation` state is local per hook call, not shared across
 * instances, so there can only be one.
 */
export function EditarCategoria({
  categoriaId,
}: {
  readonly categoriaId: string;
}) {
  const query = useCategorias();
  const eliminacion = useEliminarCategoria();

  if (eliminacion.isPending || eliminacion.isSuccess) {
    return null;
  }

  if (query.isPending) {
    return <p role="status">Cargando…</p>;
  }

  if (query.isError) {
    return (
      <div>
        <p role="alert">{mensajeDeErrorCatalogo(query.error)}</p>
        <Link to="/configuracion/categorias">Volver a Categorías</Link>
      </div>
    );
  }

  const categoria = query.data.categorias.find((c) => c.id === categoriaId);

  if (!categoria) {
    return (
      <div>
        <p role="status">Esa categoría ya no existe.</p>
        <Link to="/configuracion/categorias">Volver a Categorías</Link>
      </div>
    );
  }

  return <EditarCategoriaCargada categoria={categoria} />;
}

/**
 * EditarCategoriaCargada — the real screen, mounted only once a `categoria`
 * is resolved (see the parent's doc comment for why). Owns the identity
 * draft (`nombre`/`bucket`, §1/Q1b's "a draft is not server state", the
 * `PerfilForm` precedent) and `useActualizarCategoria` (task 29).
 *
 * `#form-identidad` + the `form=` attribute mechanism (§1/Q3b mechanism 1):
 * `Guardar`/`Cancelar` are NOT nested inside the `<form>` — they are
 * associated to it via the HTML `form` attribute, so the footer can later
 * (task 34) host `Eliminar categoría` alongside them without that button
 * accidentally submitting the identity form. `Guardar`'s accessible name
 * stays plain "Guardar" (no `aria-label` — the visible text is already
 * unambiguous, unlike `Cancelar`/`Eliminar categoría` which need
 * disambiguation because a screen reader could otherwise conflate them
 * with `NuevaCategoriaForm`'s own `Cancelar`, §1/Q3b mechanism 3).
 */
function EditarCategoriaCargada({
  categoria,
}: {
  readonly categoria: CategoriaDto;
}) {
  const actualizacion = useActualizarCategoria();
  const [nombre, setNombre] = useState(categoria.nombre);
  const [bucket, setBucket] = useState(categoria.bucket);

  function cancelarIdentidad() {
    setNombre(categoria.nombre);
    setBucket(categoria.bucket);
  }

  function guardarIdentidad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    actualizacion.mutate({
      id: categoria.id,
      patch: { nombre, bucket: bucket as BucketAsignable },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Ruta de navegación">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          <li>
            <Link to="/configuracion">Configuración</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to="/configuracion/categorias">Categorías</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <span aria-current="page">{categoria.nombre}</span>
          </li>
        </ol>
      </nav>
      <h1 className="text-xl font-semibold text-slate-900">Editar categoría</h1>

      <form
        id="form-identidad"
        onSubmit={guardarIdentidad}
        className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]"
      >
        <CampoTexto
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          required
        />
        <CampoSelect
          label="Bucket (obligatorio)"
          value={bucket}
          onChange={setBucket}
          options={OPCIONES_BUCKET}
          required
        />
      </form>

      {actualizacion.isError && (
        <p role="alert" className="text-sm text-red-600">
          {mensajeDeErrorCatalogo(actualizacion.error)}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          form="form-identidad"
          onClick={cancelarIdentidad}
          aria-label="Cancelar cambios de nombre y bucket"
          className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold"
        >
          Cancelar
        </button>
        <button
          type="submit"
          form="form-identidad"
          disabled={actualizacion.isPending}
          className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </div>
    </div>
  );
}
