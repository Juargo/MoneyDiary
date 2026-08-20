/**
 * CategoriasPanel.tsx — US-044 PR5b, T5b.4
 *
 * Presents the categoría catalog grouped by bucket:
 *  - groups in Necesidades → Gustos → Ahorro order (ETIQUETA_BUCKET from theme)
 *  - per group heading + CategoriaFila rows in catalog order (ORDER pinning)
 *  - hint line: «Toca una categoría para editarla o eliminarla.» (D-13 mobile)
 *  - empty state when catalog has zero categories
 *  - 'Nueva categoría' toggle button (inline form lands in PR5c)
 *
 * No fetch, no env. Route (app/configuracion.tsx) owns the catálogo fetch
 * lifecycle; this component receives the resolved CatalogoDto as a prop (D-01).
 *
 * D-12: NO delete control on the list row. Deletion lives on the edit screen.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CatalogoDto } from '../../domain/catalogo.types';
import { agruparPorBucket } from '../../domain/agrupar-categorias-por-bucket';
import { CategoriaFila } from './CategoriaFila';
import { NuevaCategoriaForm } from './NuevaCategoriaForm';
import { ETIQUETA_BUCKET } from '../../theme/colors';

export interface CategoriasPanelProps {
  readonly catalogo: CatalogoDto;
  /** Called after a new category is successfully created — the route uses this
   *  to trigger its useFocusEffect-backed catálogo refetch (D-10). */
  readonly onCatalogoChange?: () => void;
}

export function CategoriasPanel({
  catalogo,
  onCatalogoChange,
}: CategoriasPanelProps) {
  const [mostrarFormNueva, setMostrarFormNueva] = useState(false);
  const grupos = agruparPorBucket(catalogo.categorias);

  const sinCategorias = catalogo.categorias.length === 0;

  return (
    <View className="gap-4">
      {/* Empty state */}
      {sinCategorias && (
        <View className="items-center py-6">
          <Text className="text-base font-semibold text-heading">
            Todavía no tienes categorías
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            Crea tu primera categoría para empezar a clasificar tus movimientos.
          </Text>
        </View>
      )}

      {/* Bucket groups */}
      {!sinCategorias &&
        grupos.map((grupo) => {
          const etiqueta = ETIQUETA_BUCKET[grupo.bucket] ?? grupo.bucket;
          return (
            <View
              key={grupo.bucket}
              testID={`grupo-${grupo.bucket}`}
              className="gap-2"
            >
              <Text
                testID={`heading-${grupo.bucket}`}
                accessibilityRole="header"
                accessible={true}
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                {etiqueta}
              </Text>
              {grupo.categorias.map((categoria) => (
                <CategoriaFila key={categoria.id} categoria={categoria} />
              ))}
            </View>
          );
        })}

      {/* Hint line — D-13: mobile variant of web's EtiquetaResponsiva */}
      {!sinCategorias && (
        <Text className="text-xs text-muted">
          Toca una categoría para editarla o eliminarla.
        </Text>
      )}

      {/* Nueva categoría toggle — form itself ships PR5c */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Nueva categoría"
        onPress={() => setMostrarFormNueva((prev) => !prev)}
        className="rounded-xl border border-dashed border-hairline bg-white px-4 py-3"
      >
        <Text className="text-center text-sm font-medium text-heading">
          + Nueva categoría
        </Text>
      </Pressable>

      {/* NuevaCategoriaForm — inline create (PR5c, T5c.3) */}
      {mostrarFormNueva && (
        <NuevaCategoriaForm
          onCreada={() => {
            setMostrarFormNueva(false);
            onCatalogoChange?.();
          }}
          onCancelar={() => setMostrarFormNueva(false)}
        />
      )}
    </View>
  );
}
