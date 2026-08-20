import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { fetchCatalogo } from '../../src/api/categorias';
import type { ApiError, ApiResult } from '../../src/domain/api-error';
import type {
  CatalogoDto,
  CategoriaDto,
} from '../../src/domain/catalogo.types';
import { copiaPorApiError } from '../../src/domain/api-error';
import { EditarCategoria } from '../../src/components/configuracion/EditarCategoria';
import { Loading } from '../../src/components/states/Loading';
import { COLORS } from '../../src/theme/colors';

type EstadoCatalogo =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: CatalogoDto };

/**
 * Route: Editar categoría (US-044 PR6a, T6a.2).
 *
 * Owns its own GET /api/categorias fetch and resolves the row by id (D-09):
 * there is no GET /api/categorias/:id endpoint and no shared cache to reuse.
 *
 * Four states (design §1.11):
 *   loading   — spinner while the fetch is in flight
 *   error     — error message + retry + back link (fetch failure)
 *   id absent — «Esa categoría ya no existe.» as a status (not role="alert"):
 *               a stale deep link is not a failure of the action just taken
 *   loaded    — EditarCategoria with the resolved row
 *
 * Back navigation: on-screen «Volver a Categorías» — _layout.tsx hides the
 * native header (D-03). Gesture/hardware back still works independently.
 */
export default function EditarCategoriaRoute() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [estadoCatalogo, setEstadoCatalogo] = useState<EstadoCatalogo>({
    fase: 'loading',
  });

  const cargarCatalogo = useCallback(async () => {
    setEstadoCatalogo({ fase: 'loading' });
    const resultado: ApiResult<CatalogoDto> = await fetchCatalogo();
    if (resultado.ok) {
      setEstadoCatalogo({ fase: 'data', dto: resultado.value });
    } else {
      setEstadoCatalogo({ fase: 'error', error: resultado.error });
    }
  }, []);

  // Fire on mount — the route is unmounted when navigated away from, so
  // mounting is equivalent to every visit. No useFocusEffect needed here
  // because the configuracion.tsx route (one level up) already re-fetches
  // its own catalog on focus; this route's catalog is independent (D-09).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarCatalogo();
  }, [cargarCatalogo]);

  // Resolve the category by id from the loaded catalog
  const categoria: CategoriaDto | undefined =
    estadoCatalogo.fase === 'data'
      ? estadoCatalogo.dto.categorias.find((c) => c.id === id)
      : undefined;

  const volverAtras = () => router.back();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* On-screen back control — native header is hidden (D-03) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Categorías"
          onPress={volverAtras}
          className="self-start py-2"
        >
          <Text className="text-sm font-medium text-heading">
            « Volver a Categorías
          </Text>
        </Pressable>

        <Text className="text-2xl font-bold text-heading">
          Editar categoría
        </Text>

        {/* Loading state */}
        {estadoCatalogo.fase === 'loading' && (
          <View testID="editar-loading">
            <Loading />
          </View>
        )}

        {/* Error state — includes retry button (design §1.11 "+back link"):
            «Volver a Categorías» above is always present, satisfying the
            "+back link" requirement even in error state. */}
        {estadoCatalogo.fase === 'error' && (
          <View className="gap-4">
            <Text className="text-sm text-muted">
              {copiaPorApiError(estadoCatalogo.error)}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
              onPress={() => void cargarCatalogo()}
              className="rounded-xl bg-ingreso px-4 py-3"
            >
              <Text className="text-center text-sm font-medium text-white">
                Reintentar
              </Text>
            </Pressable>
          </View>
        )}

        {/* Id absent state — rendered as plain text/status (NOT role="alert").
            Design §1.11: a stale deep link is not a failure of the action
            the user just took. */}
        {estadoCatalogo.fase === 'data' && !categoria && (
          <Text className="text-sm text-muted">
            Esa categoría ya no existe.
          </Text>
        )}

        {/* Loaded state */}
        {estadoCatalogo.fase === 'data' && categoria && (
          <EditarCategoria
            categoria={categoria}
            onGuardado={() => void cargarCatalogo()}
            onCancelar={volverAtras}
            onEliminado={volverAtras}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
