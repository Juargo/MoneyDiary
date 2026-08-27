import { useState } from 'react';
import type { FormEvent } from 'react';
import { useCrearCategoria } from '@/api/use-crear-categoria';
import { BUCKETS_ASIGNABLES } from '@/api/catalogo-constantes';
import type { BucketAsignable } from '@/api/catalogo-constantes';
import { ETIQUETA_BUCKET } from '@/lib/bucket-colors';
import { CampoTexto } from '../CampoTexto';
import { CampoSelect } from './CampoSelect';
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
 * three `BUCKETS_ASIGNABLES` options displayed via `ETIQUETA_BUCKET` — same
 * lookup the list's group headings and `CategoriaFila` use, one source).
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
const OPCIONES_BUCKET = BUCKETS_ASIGNABLES.map((bucket) => ({
  value: bucket,
  label: ETIQUETA_BUCKET[bucket] ?? bucket,
}));

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

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate({ nombre, bucket }, { onSuccess: onCerrar });
  }

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-4 rounded-md border border-border p-4"
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
          label="Bucket (obligatorio)"
          value={bucket}
          onChange={(value) => setBucket(value as BucketAsignable)}
          options={OPCIONES_BUCKET}
          required
          disabled={esDemo}
        />
      </div>
      {esDemo && (
        <p role="note" className="text-sm text-muted-foreground">
          {MENSAJE_DEMO_CATALOGO}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
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
