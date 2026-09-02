import { useEffect, useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { construirOpcionesBucket } from '@/lib/bucket-colors';
import { BotonVolver } from '../BotonVolver';
import { FOCUS_RING } from '../estilos';
import { CampoTexto } from '../CampoTexto';
import { CampoSelect } from './CampoSelect';
import { ConfirmarImpactoDialog } from './ConfirmarImpactoDialog';
import { Loading } from '../../states/Loading';
import { SUPERFICIE_SECCION } from '../SeccionConfig';
import { PatronesSection } from './PatronesSection';
import {
  fraseDeImpacto,
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';
import { Button } from '@/components/ui/button';

const OPCIONES_BUCKET = construirOpcionesBucket(BUCKETS_ASIGNABLES);

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

  // Judgment-day finding (round 2, cleanup added round 3): `eliminacion`
  // lives HERE, in the component that does NOT remount on in-place
  // navigation between two categories' edit screens (only
  // `EditarCategoriaCargada`, keyed by `categoria.id`, does) — so a DELETE
  // still in flight for the PREVIOUS category stays wired to the SAME
  // mutation observer after the user navigates to a DIFFERENT one.
  // `MutationObserver.reset()` (query-core) detaches the observer from its
  // current mutation: the stale request keeps running, but this observer
  // stops receiving its resolution, so the PREVIOUS category's mutate-level
  // `onSuccess` (navigate back to the list, in `confirmarEliminar`) can no
  // longer fire against a screen the user has already navigated away from.
  // `eliminacion.reset` is bound once per observer (stable identity) — this
  // effect only re-fires when `categoriaId` actually changes, never on
  // every render.
  //
  // The cleanup return (round 3) additionally resets on UNMOUNT — leaving
  // this screen entirely (breadcrumb, main nav, browser back), not just
  // navigating in-place to another `categoriaId`. `MutationObserver#notify`
  // (query-core) already gates the mutate-level `onSuccess` on
  // `this.hasListeners()`, so a full unmount that completes strictly BEFORE
  // the DELETE resolves is already safe without this — but the explicit
  // reset keeps the guard correct for ANY resolution ordering (including a
  // DELETE that resolves WHILE the unmount is still being processed) and
  // makes the "detach on leaving this screen, however the user leaves it"
  // rule visible in one place instead of relying on an implicit library
  // behavior that isn't obvious from reading this file alone.
  useEffect(() => {
    // `eliminacion` itself is a NEW object every render (a fresh
    // `MutationObserver` result each time `useMutation()` re-renders) —
    // depending on it directly would refire this effect on every
    // unrelated re-render, not just when `categoriaId` actually changes.
    // `eliminacion.reset` has a stable identity for the SAME observer
    // instance (query-core's `MutationObserver` binds it once in its
    // constructor), so narrowing the deps array to `categoriaId` alone is
    // intentional and safe — the cleanup below reads the SAME stable
    // reference, not a stale one.
    eliminacion.reset();
    return () => {
      eliminacion.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId]);

  if (eliminacion.isSuccess) {
    return null;
  }

  if (query.isPending) {
    // Era un `<p role="status">Cargando…</p>` PELADO: texto negro de 16px
    // arriba a la izquierda sobre el fondo azul, sin centrar, sin spinner,
    // sin nada. `CategoriasPanel` ya usaba el `Loading` compartido para el
    // mismo estado en la pantalla de al lado — eran dos tratamientos
    // distintos del mismo momento dentro de la misma sección.
    //
    // El string y el `role` NO cambian: `Loading` monta su `role="status"`
    // con el mensaje adentro, así que `findByRole('status')` +
    // `toHaveTextContent('Cargando…')` sigue valiendo.
    return <Loading message="Cargando…" />;
  }

  if (query.isError) {
    return (
      <div
        className={cn(
          'mx-auto flex max-w-sm flex-col items-center gap-4 text-center',
          SUPERFICIE_SECCION,
        )}
      >
        <p role="alert" className="text-sm text-destructive">
          {mensajeDeErrorCatalogo(query.error)}
        </p>
        {/*
          SC 2.5.8 fix (US-063 PR #4, product defect found by the harness on
          PR #1): this `<Link>` used to be bare text, a standalone back
          control alone on its own line — measured at `{ width: 147.8,
          height: 20 }`, below the 24×24 floor. It is NOT inline text
          constrained by a sentence (the *Inline* exception does not apply
          here, unlike the breadcrumb's own links), so it needed real
          padding, not an exemption. Reuses the footer's `Cancelar` pattern
          verbatim rather than inventing a fourth control style.
        */}
        <Button asChild variant="outline">
          <Link to="/configuracion/categorias">Volver a Categorías</Link>
        </Button>
      </div>
    );
  }

  const categoria = query.data.categorias.find((c) => c.id === categoriaId);

  if (!categoria) {
    return (
      <div
        className={cn(
          'mx-auto flex max-w-sm flex-col items-center gap-4 text-center',
          SUPERFICIE_SECCION,
        )}
      >
        <p role="status" className="text-sm text-muted-foreground">
          Esa categoría ya no existe.
        </p>
        <Button asChild variant="outline">
          <Link to="/configuracion/categorias">Volver a Categorías</Link>
        </Button>
      </div>
    );
  }

  return (
    // `key={categoria.id}` (judgment-day finding, 2026-08-14): without it,
    // navigating from one category's edit screen to another within the SAME
    // mounted route instance keeps `EditarCategoriaCargada`'s `nombre`/
    // `bucket` `useState` seeded from the PREVIOUS category — React
    // reconciles by component type/position, not by prop value, so the
    // `categoria` prop changing alone does not reset that draft. The key
    // forces a remount (and a fresh `useState` seed) whenever the resolved
    // category's identity actually changes.
    <EditarCategoriaCargada
      key={categoria.id}
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
 * `cerrarDialogo` is only ever reachable while its dialog's own mutation is
 * NOT pending (`ConfirmarImpactoDialog`'s round-3 `pendiente` gate on
 * Escape/Cancelar), so this focus restore never targets a trigger this
 * SAME render still has disabled.
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
  // Judgment-day finding (round 2, broadened round 3): `fraseDeImpacto`
  // used to read `transaccionesCount`/`bucketAnterior` LIVE off `categoria`
  // on every render, so the dialog's copy could go self-contradictory
  // (`«X» pasa de Necesidades a Necesidades.`) the instant the underlying
  // state moved while the dialog stayed open — e.g. `Cancelar` resetting
  // `bucket` back to `categoria.bucket`, a second `Bucket` selection, OR
  // (round 3) a background refetch of `['categorias']` while a dialog is
  // open (unreachable in THIS PR's shipped scope — `refetchOnWindowFocus:
  // false`, `staleTime: 30_000`, nothing else invalidates the key while
  // this screen is mounted — but PR #4's pattern mutations invalidate it
  // from this SAME screen, so the numbers a user reads mid-confirmation
  // could silently change under them). `nombre`/`bucketNuevo`/
  // `bucketAnterior`/`transaccionesCount` are ALL frozen HERE, at the
  // moment a dialog opens, and BOTH dialogs render from this ONE snapshot
  // instead of the live `categoria` prop — the outer controls are ALSO
  // disabled while `dialogo !== null` (below), but this snapshot is the
  // defense that fixes the whole class rather than each individual
  // control. `eliminar` doesn't use `bucketNuevo`/`bucketAnterior` (there
  // is no "previous bucket" concept for a delete) — ONE shape for both
  // dialogs beats two parallel snapshot states for the same "freeze at
  // open time" concern (`dry`).
  const [snapshotAlAbrirDialogo, setSnapshotAlAbrirDialogo] = useState<{
    readonly nombre: string;
    readonly bucketNuevo: string;
    readonly bucketAnterior: string;
    readonly transaccionesCount: number;
  } | null>(null);
  const guardarRef = useRef<HTMLButtonElement>(null);
  const eliminarRef = useRef<HTMLButtonElement>(null);
  // Judgment-day round 3: a successful bucket-change confirm used to call
  // `guardarRef.current?.focus()` SYNCHRONOUSLY inside the mutation's
  // mutate-level `onSuccess` — but `MutationObserver#notify` (query-core)
  // invokes mutate-level callbacks BEFORE it notifies the observer's own
  // listeners (the subscription that drives `actualizacion.isPending`'s
  // React state). At that exact point `Guardar` is STILL rendered
  // `disabled` from the last commit (`isPending: true`), and `.focus()` on
  // a genuinely disabled element is a no-op — focus silently fell to
  // `<body>`. This raced invisibly against an ALREADY-RESOLVED mock
  // promise (both state transitions collapse into one microtask, masking
  // it) but is real against any actual network round-trip, where a
  // committed "pending" render always precedes the "success" one. A ref
  // flag + a `useEffect` keyed on `dialogo` — React guarantees effects run
  // AFTER the commit — defers `.focus()` until `Guardar`'s `disabled` has
  // caught up with `isPending: false`, without the "setState inside an
  // effect" smell a plain state flag would need to clear itself.
  const restaurarFocoGuardarRef = useRef(false);
  useEffect(() => {
    if (dialogo === null && restaurarFocoGuardarRef.current) {
      guardarRef.current?.focus();
      restaurarFocoGuardarRef.current = false;
    }
  }, [dialogo]);

  const bucketSucio = bucket !== categoria.bucket;

  function cancelarIdentidad() {
    setNombre(categoria.nombre);
    setBucket(categoria.bucket);
    // WCTG-04 (frozen spec): "Cancelar MUST discard ONLY the identity
    // draft ... and return to the list" — discarding the draft without
    // navigating away left the user stranded on the edit screen.
    void navigate({ to: '/configuracion/categorias' });
  }

  function guardarIdentidad(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Re-entrancy guard: the submit button's `disabled` attribute does NOT
    // stop a form submission triggered by Enter inside `Nombre`, so a rapid
    // double-Enter (or an Enter while the OTHER mutation/dialog is busy)
    // can still reach this handler. `dialogo !== null` additionally blocks
    // submitting the identity form while a confirmation dialog is open —
    // otherwise `Guardar` could race its own PATCH against an in-flight
    // DELETE from the footer's delete confirmation.
    if (dialogo !== null || actualizacion.isPending || eliminacion.isPending) {
      return;
    }
    if (bucketSucio) {
      actualizacion.reset();
      setSnapshotAlAbrirDialogo({
        nombre,
        bucketNuevo: bucket,
        bucketAnterior: categoria.bucket,
        transaccionesCount: categoria.transaccionesCount,
      });
      setDialogo('cambiar-bucket');
      return;
    }
    actualizacion.mutate({
      id: categoria.id,
      patch: { nombre, bucket: bucket as BucketAsignable },
    });
  }

  function confirmarCambioBucket() {
    // `snapshotAlAbrirDialogo` is always set by the time this fires — it's
    // only reachable via the dialog's `onConfirmar`, which only renders
    // once `guardarIdentidad` has set it above. The guard keeps this
    // function total without an unsafe non-null assertion.
    if (!snapshotAlAbrirDialogo) {
      return;
    }
    actualizacion.mutate(
      {
        id: categoria.id,
        patch: {
          nombre: snapshotAlAbrirDialogo.nombre,
          bucket: snapshotAlAbrirDialogo.bucketNuevo as BucketAsignable,
        },
      },
      {
        onSuccess: () => {
          restaurarFocoGuardarRef.current = true;
          setDialogo(null);
        },
      },
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
      {/*
        US-063 task 24 (WCTM-04, D-05/D-06): below `md` the 3-level
        breadcrumb is replaced, visually, by a back-icon control pointing
        one level up — `/configuracion/categorias`, the same destination and
        accessible name the shipped error/not-found `<Link>`s already use
        (D-05, reused verbatim, not invented). The breadcrumb stays
        unconditionally in the DOM (`hidden md:block`, D-08 CSS-only) rather
        than being removed — jsdom cannot prove which of the two is actually
        VISIBLE at a given width, so both mechanisms are pinned here and the
        real-viewport claim is Playwright's job (`edit-surface.e2e.ts`,
        `E-06`).
      */}
      <div className="md:hidden">
        <BotonVolver
          to="/configuracion/categorias"
          label="Volver a Categorías"
        />
      </div>
      {/*
        Los dos `<Link>` de la breadcrumb no llevaban NINGUNA clase. El
        preflight de Tailwind pone `a { color: inherit; text-decoration:
        inherit }`, así que se renderizaban como texto negro plano —
        visualmente idénticos a los separadores `/` y al nombre de la
        categoría actual, que NO son navegables. Un breadcrumb en el que no
        se distingue qué es link no es un breadcrumb.

        `text-secondary` es el mismo color que la sidebar y las tabs usan
        para un link de navegación no activo (5.59:1 sobre el fondo azul,
        AA), y el subrayado en hover da un segundo canal además del color.
        El crumb actual se queda en `text-foreground` sin subrayado: es la
        página donde estás, no un destino.

        Los separadores bajan a `text-muted-foreground` para que dejen de
        competir en peso con lo que separan.
      */}
      <nav aria-label="Ruta de navegación" className="hidden md:block">
        <ol className="flex flex-wrap items-center gap-1 text-sm">
          <li>
            <Link
              to="/configuracion"
              className={cn(
                'text-secondary transition-colors hover:text-primary hover:underline',
                FOCUS_RING,
              )}
            >
              Configuración
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground">
            /
          </li>
          <li>
            <Link
              to="/configuracion/categorias"
              className={cn(
                'text-secondary transition-colors hover:text-primary hover:underline',
                FOCUS_RING,
              )}
            >
              Categorías
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground">
            /
          </li>
          <li>
            <span aria-current="page" className="font-medium text-foreground">
              {categoria.nombre}
            </span>
          </li>
        </ol>
      </nav>
      <h1 className="text-xl font-semibold text-foreground">
        Editar categoría
      </h1>

      {/*
        Identidad sobre superficie, igual que el resto de Configuración.

        Nota honesta sobre una tensión que la contención hace MÁS visible en
        vez de tapar: el `Guardar` de esta identidad vive en el `<footer>` de
        más abajo, con la sección de Patrones en el medio. Eso no es un
        descuido de este cambio — es la consecuencia de Q3b (PatronesSection
        tiene que estar FUERA de `#form-identidad`, porque los patrones
        commitean por fila, independientes de Guardar/Cancelar) más D-09/D-10
        (el orden del DOM `[Guardar, Cancelar] → Eliminar` sostiene el orden
        de tabulación y está fijado por WCTM-05).

        La lectura que hace coherente al footer es que NO es el pie de este
        formulario sino la barra de acciones de la PANTALLA: guarda la
        identidad, cancela la identidad y borra la categoría entera. Por eso
        es su propia superficie, hermana de esta y de Patrones, en vez de
        estar metida acá adentro. Mover `Guardar` dentro de esta card
        arreglaría la adyacencia, pero rompería el orden visual de los tres
        botones que `edit-surface.e2e.ts` (E-08) fija a 1280, y eso es más
        caro que la molestia que resuelve.
      */}
      <div className={cn('flex flex-col gap-4', SUPERFICIE_SECCION)}>
        <form
          id="form-identidad"
          onSubmit={guardarIdentidad}
          className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[1fr_220px]"
        >
          {/*
          `dialogo !== null` (judgment-day round 2): while EITHER
          confirmation dialog is open, the identity draft must not be able
          to move — `Bucket` changing underneath the bucket-change dialog is
          exactly the race the frozen `snapshotAlAbrirDialogo` snapshot
          (above) also defends against; disabling here is the first,
          user-facing layer of that same fix.
        */}
          {/*
          `actualizacion.isPending` (judgment-day round 4): `dialogo !== null`
          alone covers only the two DIALOG-gated paths. A bucket-clean
          (rename-only) `Guardar` mutates directly, with no dialog, so
          `dialogo` stays `null` for the whole in-flight window — leaving
          these fields editable while their own values are mid-`PATCH`.
        */}
          <CampoTexto
            label="Nombre"
            value={nombre}
            onChange={setNombre}
            required
            disabled={esDemo || dialogo !== null || actualizacion.isPending}
          />
          <CampoSelect
            label="Bucket (obligatorio)"
            value={bucket}
            onChange={setBucket}
            options={OPCIONES_BUCKET}
            required
            disabled={esDemo || dialogo !== null || actualizacion.isPending}
          />
        </form>

        {esDemo && (
          <p role="note" className="text-sm text-muted-foreground">
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
          <p role="alert" className="text-sm text-destructive">
            {mensajeDeErrorCatalogo(actualizacion.error)}
          </p>
        )}
      </div>

      {/*
        PatronesSection lives OUTSIDE `#form-identidad` (§1/Q3b's DOM
        boundary, mechanism 1) — pattern rows commit immediately, per row,
        fully independent of `Guardar`/`Cancelar` (WCTG-04). `Cancelar`
        scopes to the identity draft ONLY; a pattern added earlier in the
        visit survives it (task 42's cross-cutting integration test).
      */}
      <PatronesSection
        categoriaId={categoria.id}
        patrones={categoria.patrones}
        esDemo={esDemo}
        // Judgment-day finding (PR #4, 2026-08-14): `ConfirmarImpactoDialog`
        // is intentionally non-modal, so without this the pattern rows and
        // `Agregar patrón` stayed fully interactive while a confirmation
        // read a frozen `snapshotAlAbrirDialogo` — the SAME `dialogo !==
        // null` condition already gates `Nombre`/`Bucket`/`Cancelar` above.
        bloqueado={dialogo !== null}
      />

      {/*
        US-063 task 27 (WCTM-05, D-10): DOM order is `[Guardar, Cancelar]`,
        then `Eliminar categoría` — mobile-first, this IS the mobile visual
        order (`Guardar` full-width above `Cancelar`). CSS can reorder
        pixels, never tab order (D-09), so the desktop appearance (shipped:
        `Eliminar` left, `Cancelar`/`Guardar` right with `Cancelar` left of
        `Guardar`) is restored byte-for-byte via `md:flex-row-reverse` on
        BOTH the outer footer and the inner Guardar/Cancelar group — two
        reversals compose back to the original visual order, they do not
        cancel out, because the outer one also swaps which GROUP is first
        (the pair vs. `Eliminar`) while the inner one swaps which BUTTON
        inside the pair is first. `border-t` (unchanged) + `md:justify-between`
        (US-043 §1/Q3b mechanism 4, now `md:`-scoped) still state what the
        layout alone can't below `md`, where the stack itself already keeps
        the red button visually last, not adjacent to `Guardar`.
      */}
      {/*
        El footer va sobre la MISMA superficie que las dos secciones de
        arriba, y no es cosmético: es alineación.

        Cuando esta pantalla pasó a superficies, `Guardar` quedó afuera de la
        card de identidad y por lo tanto 34px más ancho que el formulario que
        guarda — `p-4` de cada lado (32) más los dos bordes de 1px. A 360px
        eso es un botón desbordando 17px por lado al form que le corresponde.
        No lo vio ningún test de jsdom: lo cazó `edit-surface.e2e.ts` (E-08),
        que compara el ancho de `Guardar` contra el ancho del form porque
        asumía que los dos eran hermanos en la misma pista.

        Darle la misma superficie restablece esa premisa por CONSTRUCCIÓN:
        misma caja, mismo padding, mismos bordes, así que las dos bandas de
        contenido son idénticas y la diferencia es 0, no "dentro de la
        tolerancia". El `border-t`/`pt-4` que hacía de regla se va: la card ya
        tiene su propio borde superior y dos separadores para lo mismo es
        redundancia. El `mt-2` también, porque el `gap-6` del contenedor ya
        da el ritmo.
      */}
      <footer
        className={cn(
          'flex flex-col gap-3 md:flex-row-reverse md:flex-wrap md:items-center md:justify-between',
          SUPERFICIE_SECCION,
        )}
      >
        <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center">
          <Button
            ref={guardarRef}
            type="submit"
            form="form-identidad"
            // `dialogo === 'eliminar'` (mirrors the Eliminar button's
            // comment below, inverted): blocks Guardar while the DELETE
            // confirm is open — otherwise it could race its PATCH against
            // an in-flight DELETE — without disabling it while its OWN
            // bucket-change dialog is open, which would break
            // `cerrarDialogo`'s synchronous focus restore back to this
            // same button.
            disabled={
              esDemo ||
              actualizacion.isPending ||
              eliminacion.isPending ||
              dialogo === 'eliminar'
            }
            className="w-full md:w-auto"
          >
            Guardar
          </Button>
          <Button
            type="button"
            variant="outline"
            form="form-identidad"
            // `dialogo !== null` (judgment-day round 2): this button was
            // NOT disabled while a dialog was open — its `onClick` resets
            // the draft back to `categoria.nombre`/`categoria.bucket`,
            // which could self-contradict the OPEN bucket-change dialog's
            // copy (`«X» pasa de Necesidades a Necesidades.`) before the
            // `snapshotAlAbrirDialogo` snapshot (above) closed that hole.
            // `esDemo` is deliberately NOT part of this condition —
            // `Cancelar` issues zero requests and stays enabled in demo.
            //
            // `actualizacion.isPending` (judgment-day round 4, both judges):
            // on a bucket-clean (rename-only) save there is NO dialog, so
            // `dialogo` stays `null` while the `PATCH` is in flight. Left
            // enabled, `Cancelar` navigated back to the list without
            // aborting that request — it resolves anyway and the rename
            // COMMITS, after the user believes they cancelled it. Round 3
            // deferred this on the grounds that the direct path has no
            // per-call `onSuccess` to race; the defect is the user's
            // intent, not the callback ordering.
            disabled={dialogo !== null || actualizacion.isPending}
            onClick={cancelarIdentidad}
            aria-label="Cancelar cambios de nombre y bucket"
            className="text-muted-foreground"
          >
            Cancelar
          </Button>
        </div>
        <Button
          ref={eliminarRef}
          type="button"
          variant="outline"
          // `dialogo === 'cambiar-bucket'` (not `dialogo !== null`,
          // deliberately): blocking only the OTHER dialog stops the silent
          // dialog-swap race (clicking here while the bucket-change confirm
          // is open) without ALSO disabling this button while ITS OWN
          // dialog is open, which would leave `eliminarRef` non-focusable
          // the instant `cerrarDialogo` tries to restore focus to it (the
          // DOM `disabled` attribute only clears on the next commit, after
          // that synchronous `.focus()` call already ran).
          //
          // `eliminacion.isPending` (judgment-day round 2): a bare
          // `dialogo === 'cambiar-bucket'` left this trigger clickable
          // while its OWN `DELETE` was in flight, and its `onClick`
          // unconditionally calls `eliminacion.reset()` — detaching the
          // observer from the in-flight mutation, flipping `isPending`
          // back to `false`, and re-enabling the dialog's confirm button
          // underneath it, letting an impatient double-click fire a second
          // `DELETE`. Round 2 traded this for a focus-restore edge case on
          // Escape mid-flight (this button, still disabled, couldn't
          // receive the focus `cerrarDialogo` tried to give it) — round 3
          // closes THAT edge case too, at the dialog level: `pendiente`
          // now blocks Escape/Cancelar inside `ConfirmarImpactoDialog`
          // itself, so `cerrarDialogo` is never invoked while
          // `eliminacion.isPending`, and no disabled-trigger focus attempt
          // happens in the first place (pinned by
          // `EditarCategoria.test.tsx`'s round 3 Escape-while-pending
          // tests).
          disabled={
            esDemo ||
            dialogo === 'cambiar-bucket' ||
            actualizacion.isPending ||
            eliminacion.isPending
          }
          onClick={() => {
            eliminacion.reset();
            setSnapshotAlAbrirDialogo({
              nombre: categoria.nombre,
              bucketNuevo: categoria.bucket,
              bucketAnterior: categoria.bucket,
              transaccionesCount: categoria.transaccionesCount,
            });
            setDialogo('eliminar');
          }}
          aria-label={`Eliminar categoría ${categoria.nombre}`}
          className="self-start text-destructive"
        >
          Eliminar categoría
        </Button>
      </footer>

      {dialogo === 'cambiar-bucket' && snapshotAlAbrirDialogo && (
        <ConfirmarImpactoDialog
          {...fraseDeImpacto({
            tipo: 'cambiar-bucket',
            // Frozen snapshot (judgment-day round 2, broadened round 3),
            // never the live `categoria`/draft — see
            // `snapshotAlAbrirDialogo`'s definition above for why.
            nombre: snapshotAlAbrirDialogo.nombre,
            transaccionesCount: snapshotAlAbrirDialogo.transaccionesCount,
            bucketAnterior: snapshotAlAbrirDialogo.bucketAnterior,
            bucketNuevo: snapshotAlAbrirDialogo.bucketNuevo,
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

      {dialogo === 'eliminar' && snapshotAlAbrirDialogo && (
        <ConfirmarImpactoDialog
          {...fraseDeImpacto({
            tipo: 'eliminar',
            // Frozen snapshot (round 3) — `nombre` was already read off
            // `categoria` directly here (unchanged by a draft either way),
            // but `transaccionesCount` used to be read LIVE; freezing it
            // alongside `nombre` keeps ONE snapshot mechanism for both
            // dialogs instead of a second, eliminar-only one (`dry`).
            nombre: snapshotAlAbrirDialogo.nombre,
            transaccionesCount: snapshotAlAbrirDialogo.transaccionesCount,
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
