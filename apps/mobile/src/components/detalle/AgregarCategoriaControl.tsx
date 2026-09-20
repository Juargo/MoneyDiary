/**
 * AgregarCategoriaControl.tsx — agregar-categoria-desde-bucket, issue #743.
 *
 * The bucket-detail-screen "Agregar categoría" affordance (usability
 * finding: a tester opened a bucket's detail screen and looked for an
 * add-category control right there, instead of leaving to Configuración →
 * Categorías). Mirrors `CategoriasPanel`'s own toggle+form idiom (a
 * dashed-border Pressable trigger that mounts `NuevaCategoriaForm` below
 * itself) but fixes the bucket via that form's `bucketFijo` prop instead of
 * letting the user pick it — this screen's bucket is never a re-choice.
 *
 * Freshness (issue #743 "immediately usable... without a reload"):
 * `BucketDetalleScreen` (the only mount site) remounts its groups subtree
 * on `onCreada` (via a version key) — see that screen's own docblock — so
 * every `ReclasificarMobileControl`'s per-instance catalog cache resets and
 * refetches fresh on next open, picking up the just-created categoría. This
 * component itself has no cache to invalidate: it only forwards the
 * `onCreada` signal up.
 *
 * Pure: no fetch of its own (delegates to `NuevaCategoriaForm`/
 * `crearCategoria`), no route.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NuevaCategoriaForm } from '../configuracion/NuevaCategoriaForm';
import type { BucketAsignable } from '../../domain/catalogo-constantes';

export interface AgregarCategoriaControlProps {
  readonly bucket: BucketAsignable;
  /** Called after a category is successfully created (form already closed). */
  readonly onCreada: () => void;
}

export function AgregarCategoriaControl({
  bucket,
  onCreada,
}: AgregarCategoriaControlProps) {
  const [abierto, setAbierto] = useState(false);

  function cerrar() {
    setAbierto(false);
  }

  function handleCreada() {
    cerrar();
    onCreada();
  }

  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar categoría"
        testID="agregar-categoria-trigger"
        onPress={() => setAbierto(true)}
        className="self-start rounded-xl border border-dashed border-hairline bg-white px-4 py-3"
      >
        <Text className="text-sm font-medium text-heading">
          + Agregar categoría
        </Text>
      </Pressable>

      {abierto && (
        <NuevaCategoriaForm
          bucketFijo={bucket}
          onCreada={handleCreada}
          onCancelar={cerrar}
        />
      )}
    </View>
  );
}
