import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { UseMutationResult } from '@tanstack/react-query';
import { useActualizarCategoria } from '@/api/use-actualizar-categoria';
import { useCategorias } from '@/api/use-categorias';
import { useEliminarCategoria } from '@/api/use-eliminar-categoria';
import { useMe } from '@/api/use-me';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { BucketAsignable } from '@/api/catalogo-constantes';
import type { ApiError } from '@/api/client';
import type { CategoriaDto } from '@/api/types';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { CampoTexto } from '../CampoTexto';
import { CampoSelect } from './CampoSelect';
import { ConfirmarImpactoDialog } from './ConfirmarImpactoDialog';
import {
  fraseDeImpacto,
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';

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
 * this guard, "Esa categoría ya no existe." would flash false for that one
 * tick. `eliminacion` is created HERE, not in the child, so the SAME hook
 * instance backs both the guard and (from task 34) the footer's delete
 * trigger — `useMutation` state is local per hook call, not shared across
 * instances, so there can only be one.
 *
 * **Guards on `isSuccess` ONLY, never `isPending`** (judgment-day finding,
 * 2026-08-14): also gating on `isPending` unmounts this component's ENTIRE
 * subtree — including an already-open `ConfirmarImpactoDialog` — for the
 * FULL delete network round-trip, not "two ticks". If the request then
 * fails, `isPending` flips back to `false` while `isSuccess` stays `false`,
 * so the guard stops blocking and `EditarCategoriaCargada` remounts FRESH
 * with `dialogo: null` — the confirmation dialog and its inline error
 * vanish and the failed delete surfaces nothing to the user (breaking task
 * 28's "dialog does not close on failure"). `isSuccess` alone is enough: it
 * is the actual "we are about to navigate away" signal this guard needs.
 */
export function EditarCategoria({
  categoriaId,
}: {
  readonly categoriaId: string;
}) {
  const query = useCategorias();
  const eliminacion = useEliminarCategoria();
  const { data: me } = useMe();
  const esDemo = me?.esDemo ?? false;

  if (eliminacion.isSuccess) {
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

  return (
    <EditarCategoriaCargada
      categoria={categoria}
      eliminacion={eliminacion}
      esDemo={esDemo}
    />
  );
}

/**
 * EditarCategoriaCargada — the real screen, mounted only once a `categoria`
 * is resolved (see the parent's doc comment for why). Owns the identity
 * draft (`nombre`/`bucket`, §1/Q1b's "a draft is not server state", the
 * `PerfilForm` precedent) and `useActualizarCategoria` (task 29).
 *
 * `#form-identidad` + the `form=` attribute mechanism (§1/Q3b mechanism 1):
 * `Guardar`/`Cancelar` are NOT nested inside the `<form>` — they are
 * associated to it via the HTML `form` attribute, so the footer can host
 * `Eliminar categoría` alongside them without that button accidentally
 * submitting the identity form. `Guardar`'s accessible name stays plain
 * "Guardar" (no `aria-label` — the visible text is already unambiguous,
 * unlike `Cancelar`/`Eliminar categoría` which need disambiguation because
 * a screen reader could otherwise conflate them with `NuevaCategoriaForm`'s
 * own `Cancelar`, §1/Q3b mechanism 3).
 *
 * **Bucket-change impact confirmation** (§1/Q3b, task 33, WCTG-07 — ships
 * in the SAME task as the `PATCH` that can trigger it, non-negotiable #3):
 * `guardarIdentidad` never calls `useActualizarCategoria` directly when
 * `bucket` is dirty relative to the loaded `categoria.bucket` — it opens
 * `ConfirmarImpactoDialog` with `fraseDeImpacto({tipo:'cambiar-bucket', …})`
 * instead.
 *
 * **Delete from the edit screen** (§1/Q6d, task 34, WCTG-05/WCTG-08 — first
 * of the two entry points, the second is the list row, PR #5): the
 * footer's red `Eliminar categoría` button opens the SAME
 * `ConfirmarImpactoDialog` shell with `fraseDeImpacto({tipo:'eliminar', …})`
 * sourced from the ALREADY-LOADED `categoria.transaccionesCount` (decision
 * 3 — never a fresh fetch). Confirming calls `eliminacion.mutate` (the hook
 * instance created in the PARENT — see `EditarCategoria`'s doc comment for
 * why) and, on success, navigates back to `/configuracion/categorias`.
 *
 * **One `dialogo` union, not two booleans** (`kiss`): only one of the two
 * confirmations can be open at a time (both are triggered by the SAME
 * footer), so `dialogo: 'cambiar-bucket' | 'eliminar' | null` is the
 * correct shape — two independent booleans would allow (and have to guard
 * against) both being true simultaneously. Escape/`Cancelar` on EITHER
 * dialog closes it via `cerrarDialogo`, which restores focus to whichever
 * button opened it (`guardarRef`/`eliminarRef`) — never touching the draft.
 *
 * **Demo** (§1/Q6c, task 35, WCTG-11): `esDemo` proactively disables
 * `Nombre`/`Bucket`/`Guardar`/`Eliminar categoría` and both dialogs' confirm
 * buttons (via their shared `pendiente` prop — `ConfirmarImpactoDialog`
 * doesn't need a separate demo-aware prop, `pendiente` already disables the
 * confirm control, `dry`), with a `role="note"` explanation
 * (`MENSAJE_DEMO_CATALOGO`) — the `PerfilForm`/`NuevaCategoriaForm` idiom.
 * `Cancelar` stays enabled (not a mutation control, issues zero request).
 * The read path (fields pre-populated, breadcrumb, everything else) renders
 * exactly as for a real session — a demo user's catalog still reads
 * normally (WCTG-11's second scenario).
 */
function EditarCategoriaCargada({
  categoria,
  eliminacion,
  esDemo,
}: {
  readonly categoria: CategoriaDto;
  readonly eliminacion: UseMutationResult<void, ApiError, string>;
  readonly esDemo: boolean;
}) {
  const navigate = useNavigate();
  const actualizacion = useActualizarCategoria();
  const [nombre, setNombre] = useState(categoria.nombre);
  const [bucket, setBucket] = useState(categoria.bucket);
  const [dialogo, setDialogo] = useState<'cambiar-bucket' | 'eliminar' | null>(
    null,
  );
  const guardarRef = useRef<HTMLButtonElement>(null);
  const eliminarRef = useRef<HTMLButtonElement>(null);

  const bucketSucio = bucket !== categoria.bucket;

  function cancelarIdentidad() {
    setNombre(categoria.nombre);
    setBucket(categoria.bucket);
  }

  function guardarIdentidad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bucketSucio) {
      setDialogo('cambiar-bucket');
      return;
    }
    actualizacion.mutate({
      id: categoria.id,
      patch: { nombre, bucket: bucket as BucketAsignable },
    });
  }

  function confirmarCambioBucket() {
    actualizacion.mutate(
      {
        id: categoria.id,
        patch: { nombre, bucket: bucket as BucketAsignable },
      },
      { onSuccess: () => setDialogo(null) },
    );
  }

  function confirmarEliminar() {
    eliminacion.mutate(categoria.id, {
      onSuccess: () => {
        void navigate({ to: '/configuracion/categorias' });
      },
    });
  }

  function cerrarDialogo() {
    const abriaEliminar = dialogo === 'eliminar';
    setDialogo(null);
    (abriaEliminar ? eliminarRef : guardarRef).current?.focus();
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
          disabled={esDemo}
        />
        <CampoSelect
          label="Bucket (obligatorio)"
          value={bucket}
          onChange={setBucket}
          options={OPCIONES_BUCKET}
          required
          disabled={esDemo}
        />
      </form>

      {esDemo && (
        <p role="note" className="text-sm text-slate-500">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}

      {/*
        `dialogo === null`: `actualizacion` is the SAME mutation for both the
        direct (bucket-clean) save and the dialog-gated (bucket-dirty)
        confirm — while ITS dialog is open, the dialog's OWN inline `error`
        prop already renders this exact message; showing both here too
        would duplicate the alert on a failed bucket-change confirm.
      */}
      {actualizacion.isError && dialogo === null && (
        <p role="alert" className="text-sm text-red-600">
          {mensajeDeErrorCatalogo(actualizacion.error)}
        </p>
      )}

      {/*
        `border-t` + `justify-between` (§1/Q3b mechanism 4): the DOM states
        what the layout alone no longer can after decision 10 put the
        destructive action in the SAME footer row as Cancelar/Guardar — the
        red button is never adjacent to Guardar, and the divider marks it as
        a separate cluster.
      */}
      <footer className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button
          ref={eliminarRef}
          type="button"
          disabled={esDemo}
          onClick={() => setDialogo('eliminar')}
          aria-label={`Eliminar categoría ${categoria.nombre}`}
          className="rounded-full border border-destructive px-4 py-2 text-sm font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
        >
          Eliminar categoría
        </button>
        <div className="flex items-center gap-2">
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
            ref={guardarRef}
            type="submit"
            form="form-identidad"
            disabled={esDemo || actualizacion.isPending}
            className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </footer>

      {dialogo === 'cambiar-bucket' && (
        <ConfirmarImpactoDialog
          {...fraseDeImpacto({
            tipo: 'cambiar-bucket',
            nombre: categoria.nombre,
            transaccionesCount: categoria.transaccionesCount,
            bucketAnterior: categoria.bucket,
            bucketNuevo: bucket,
          })}
          pendiente={esDemo || actualizacion.isPending}
          error={
            actualizacion.isError
              ? mensajeDeErrorCatalogo(actualizacion.error)
              : null
          }
          onConfirmar={confirmarCambioBucket}
          onCancelar={cerrarDialogo}
        />
      )}

      {dialogo === 'eliminar' && (
        <ConfirmarImpactoDialog
          {...fraseDeImpacto({
            tipo: 'eliminar',
            nombre: categoria.nombre,
            transaccionesCount: categoria.transaccionesCount,
          })}
          pendiente={esDemo || eliminacion.isPending}
          error={
            eliminacion.isError
              ? mensajeDeErrorCatalogo(eliminacion.error)
              : null
          }
          onConfirmar={confirmarEliminar}
          onCancelar={cerrarDialogo}
        />
      )}
    </div>
  );
}
