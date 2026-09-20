import { useRef, useState } from 'react';
import { NuevaCategoriaDesdeFilaForm } from '@/components/preview/NuevaCategoriaDesdeFilaForm';
import { Button } from '@/components/ui/button';
import type { CategoriaDto } from '@/api/types';

const MENSAJE_DEMO_AGREGAR_CATEGORIA =
  'Estás en una cuenta de demostración. Crea una cuenta real para agregar categorías.';

/**
 * AgregarCategoriaControl — the bucket-detail-screen "Agregar categoría"
 * affordance (issue #743, usability finding: a tester opened a bucket's
 * detail screen and looked for an add-category control right there, instead
 * of leaving to Configuración → Categorías).
 *
 * Structurally mirrors `ReevaluarPatronesControl` (same page-header trigger
 * + conditional panel idiom, own local `abierto` state, focus returned to
 * the trigger on close). The panel itself is NOT a new form: it reuses
 * `NuevaCategoriaDesdeFilaForm` verbatim (crear-categoria-desde-preview
 * precedent) — same bucket-fixed shell, same `useCrearCategoria` mutation,
 * same error copy. `bucket` here is the PAGE's own bucket (never a user
 * choice, unlike that form's other caller `FilaRevision`, which has a
 * per-row bucket cascade to fix instead).
 *
 * Cache freshness (issue #743 "immediately usable... without a reload"):
 * `useCrearCategoria`'s own `onSuccess` seeds the shared `['categorias']`
 * query with the created categoría BEFORE invalidating (see that hook's
 * docblock) — `ReclasificarCategoriaControl` reads that same query, so no
 * extra plumbing is needed here for the new categoría to show up in the
 * reclassify `<select>`.
 *
 * `BucketDetalleMesPage` is the only mount site, gated on
 * `BUCKETS_ASIGNABLES.includes(bucket)` — `SinCategoria` cannot own a
 * categoría, so that page never renders this control there at all (the
 * gate lives in the caller, not here, same separation `ReevaluarPatronesControl`
 * uses for its own `esDemo` note).
 */
export function AgregarCategoriaControl({
  bucket,
  esDemo = false,
  onCreada,
}: {
  readonly bucket: string;
  readonly esDemo?: boolean;
  readonly onCreada: (categoria: CategoriaDto) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);

  function abrir() {
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    triggerRef.current?.focus();
  }

  function handleCreada(categoria: CategoriaDto) {
    cerrar();
    onCreada(categoria);
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        size="sm"
        disabled={esDemo}
        onClick={abrir}
      >
        Agregar categoría
      </Button>
      {esDemo && (
        <p role="note" className="text-xs text-muted-foreground">
          {MENSAJE_DEMO_AGREGAR_CATEGORIA}
        </p>
      )}
      {abierto && (
        <div className="w-full max-w-md">
          <NuevaCategoriaDesdeFilaForm
            bucket={bucket}
            descripcionFila=""
            esDemo={esDemo}
            onCancelar={cerrar}
            onCreada={handleCreada}
          />
        </div>
      )}
    </div>
  );
}
