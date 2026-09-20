import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCrearCategoria } from '@/api/use-crear-categoria';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type {
  BucketAsignable,
  IconoCategoria,
} from '@/api/catalogo-constantes';
import { construirOpcionesBucket } from '@/lib/bucket-colors';
import { cn } from '@/lib/utils';
import { CampoTexto } from '../CampoTexto';
import { SUPERFICIE_SECCION } from '../SeccionConfig';
import { CampoSelect } from './CampoSelect';
import { SelectorIcono } from './SelectorIcono';
import {
  MENSAJE_DEMO_CATALOGO,
  mensajeDeErrorCatalogo,
} from './mensajes-catalogo';
import { Button } from '@/components/ui/button';

/**
 * NuevaCategoriaForm — CA-01's creation flow (US-043, design.md §1/Q9a,
 * WCTG-02, WCTG-11). Toggled open by `CategoriasPanel`'s `Nueva categoría`
 * button (task 26); NOT a route (Q9a — a not-yet-created category has no id,
 * so it cannot own patterns; reusing the edit screen would need a `modo`
 * flag, the exact anti-pattern US-042's D-02 rejected).
 *
 * `Nombre` (`CampoTexto`) + `Bucket (obligatorio)` (`CampoSelect`, A1: the
 * three `BUCKETS_ASIGNABLES` options built via `construirOpcionesBucket`
 * (`lib/bucket-colors.ts`) — same helper `EditarCategoria` and the review
 * cascades (`FilaRevision`/`PreviewMuestra`/`RegistrarMovimientoForm`) use,
 * one source for the `ETIQUETA_BUCKET` label lookup, round-9 critique fix).
 * Defaults `bucket` to the first assignable bucket — a native `<select>`
 * always has a selected value, so there is no "unchosen" state to model.
 *
 * `Crear` submits `POST /api/categorias` (`useCrearCategoria`, profile B).
 * On `201` the mutation's `onSuccess` calls `onCerrar` — the parent
 * (`CategoriasPanel`) unmounts this form; the new row appears via profile
 * B's invalidation refetch, not via local state here. `Cancelar` also calls
 * `onCerrar`, with **zero** request — it is not a mutation control, so it
 * stays enabled even for a demo session (WCTG-11 disables only controls
 * that can mutate).
 *
 * Errors render `mensajeDeErrorCatalogo(mutation.error)` in a `role="alert"`
 * — never `body.message` (design.md §1/Q8b's discipline). `NOMBRE_DUPLICADO`
 * (409) is the realistic failure this screen produces.
 *
 * Demo (Q6c): `Nombre`/`Bucket`/`Crear` are proactively `disabled`, with a
 * `role="note"` explanation (`MENSAJE_DEMO_CATALOGO`) — the `PerfilForm`
 * idiom, applied to this feature's own constant.
 */
const OPCIONES_BUCKET = construirOpcionesBucket(BUCKETS_ASIGNABLES);

export function NuevaCategoriaForm({
  esDemo,
  onCerrar,
}: {
  readonly esDemo: boolean;
  readonly onCerrar: () => void;
}) {
  const mutation = useCrearCategoria();
  const [nombre, setNombre] = useState('');
  const [bucket, setBucket] = useState<BucketAsignable>(BUCKETS_ASIGNABLES[0]);
  const [icono, setIcono] = useState<IconoCategoria | null>(null);

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // `icono ?? undefined` (categoria-iconografia, CATICO-02): the default
    // "Sin icono" pick and never touching the picker both mean the same
    // thing on CREATE (no icon), so the key is only sent when the caller
    // actually chose one — `JSON.stringify` drops an `undefined` property,
    // keeping the no-icon POST body byte-identical to before this feature.
    mutation.mutate(
      { nombre, bucket, icono: icono ?? undefined },
      { onSuccess: onCerrar },
    );
  }

  return (
    <form
      onSubmit={enviar}
      // Misma superficie que los grupos de bucket entre los que se abre: sin
      // `bg-card` el form quedaba transparente sobre el fondo azul mientras
      // las tarjetas de alrededor eran blancas, y `rounded-md`/`rounded-lg`
      // resuelven los dos a `0` con `--radius: 0rem` — o sea, la diferencia
      // era ruido inerte, no una decisión.
      className={cn('flex flex-col gap-4', SUPERFICIE_SECCION)}
    >
      {/*
       * US-063 PR #4 (post-task-25 maintainer extension, NOT WCTM-05 —
       * that requirement names only EditarCategoria): task 25 closed the
       * 640-767px band gap on EditarCategoria's identical Nombre/Bucket
       * grid (`sm:` -> `md:`) but left this sibling form on `sm:`, which
       * this same PR shipped as a self-inflicted inconsistency between
       * the two forms on the same Categorías surface. Moved here to
       * match, on maintainer judgment (design.md:371 names this file;
       * WCTM-05 does not).
       */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
        <CampoTexto
          label="Nombre"
          value={nombre}
          onChange={setNombre}
          required
          disabled={esDemo}
        />
        <CampoSelect
          label="Grupo (obligatorio)"
          value={bucket}
          onChange={(value) => setBucket(value as BucketAsignable)}
          options={OPCIONES_BUCKET}
          required
          disabled={esDemo}
        />
        {/*
         * issue #750 — "bucket" es jerga interna sin explicación en la UI
         * (una usuaria de prueba preguntó "¿por qué sale bucket?"). Copy
         * aprobado por el owner, verbatim; texto plano siempre visible
         * (mismo idioma que la ayuda inline de PreviewMuestra: sin
         * tooltip/popover), spanning ambas columnas del grid.
         */}
        <p className="text-xs text-muted-foreground md:col-span-2">
          Necesidades, Gustos o Ahorro. Define cómo cuenta este gasto en tu
          50/30/20. Puedes cambiarlo después, pero afecta todos los meses.
        </p>
      </div>
      <SelectorIcono
        name="icono-nueva-categoria"
        value={icono}
        onChange={setIcono}
        disabled={esDemo}
      />
      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-error-foreground">
          {mensajeDeErrorCatalogo(mutation.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="text-muted-foreground"
          onClick={onCerrar}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={esDemo || mutation.isPending}>
          Crear
        </Button>
      </div>
    </form>
  );
}
