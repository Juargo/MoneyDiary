import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { fetchMe } from '../src/api/client';
import { fetchCatalogo } from '../src/api/categorias';
import type { ApiError, ApiResult } from '../src/domain/api-error';
import type { MeDto } from '../src/domain/resumen.types';
import type { CatalogoDto } from '../src/domain/catalogo.types';
import {
  TabsConfiguracion,
  type TabConfiguracion,
} from '../src/components/configuracion/TabsConfiguracion';
import { PerfilPanel } from '../src/components/configuracion/PerfilPanel';
import { CategoriasPanel } from '../src/components/configuracion/CategoriasPanel';
import { Loading } from '../src/components/states/Loading';
import { ErrorState } from '../src/components/states/Error';
import { COLORS } from '../src/theme/colors';

type EstadoMe =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: MeDto };

type EstadoCatalogo =
  | { fase: 'loading' }
  | { fase: 'error'; error: ApiError }
  | { fase: 'data'; dto: CatalogoDto };

/**
 * Route: Configuración screen (US-044 PR3b).
 * Owns `me` and `catálogo` fetch lifecycles independently (D-01).
 * `useFocusEffect` guarantees fresh catálogo data on screen re-entry (D-10).
 */
export default function Configuracion() {
  const router = useRouter();
  const [tabActiva, setTabActiva] = useState<TabConfiguracion>('perfil');
  const [estadoMe, setEstadoMe] = useState<EstadoMe>({ fase: 'loading' });
  const [estadoCatalogo, setEstadoCatalogo] = useState<EstadoCatalogo>({
    fase: 'loading',
  });

  const cargarMe = useCallback(async () => {
    setEstadoMe({ fase: 'loading' });
    const resultado: ApiResult<MeDto> = await fetchMe();
    if (resultado.ok) {
      setEstadoMe({ fase: 'data', dto: resultado.value });
    } else {
      setEstadoMe({ fase: 'error', error: resultado.error });
    }
  }, []);

  const cargarCatalogo = useCallback(async () => {
    setEstadoCatalogo({ fase: 'loading' });
    const resultado: ApiResult<CatalogoDto> = await fetchCatalogo();
    if (resultado.ok) {
      setEstadoCatalogo({ fase: 'data', dto: resultado.value });
    } else {
      setEstadoCatalogo({ fase: 'error', error: resultado.error });
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarMe();
  }, [cargarMe]);

  useFocusEffect(
    useCallback(() => {
      void cargarCatalogo();
    }, [cargarCatalogo]),
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.canvas }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al resumen"
          onPress={() => router.back()}
          className="self-start py-2"
        >
          <Text className="text-sm font-medium text-heading">
            « Volver al resumen
          </Text>
        </Pressable>

        <Text className="text-2xl font-bold text-heading">Configuración</Text>

        <TabsConfiguracion tabActiva={tabActiva} onCambiarTab={setTabActiva} />

        {tabActiva === 'perfil' && (
          <View testID="perfil-tab-content">
            {estadoMe.fase === 'loading' && (
              <View testID="perfil-loading">
                <Loading />
              </View>
            )}
            {estadoMe.fase === 'error' && (
              <ErrorState error={estadoMe.error} onRetry={cargarMe} />
            )}
            {estadoMe.fase === 'data' && <PerfilPanel me={estadoMe.dto} />}
          </View>
        )}

        {tabActiva === 'categorias' && (
          <View testID="categorias-tab-content">
            {estadoCatalogo.fase === 'loading' && (
              <View testID="categorias-loading">
                <Loading />
              </View>
            )}
            {estadoCatalogo.fase === 'error' && (
              <ErrorState
                error={estadoCatalogo.error}
                onRetry={cargarCatalogo}
              />
            )}
            {estadoCatalogo.fase === 'data' && (
              <CategoriasPanel catalogo={estadoCatalogo.dto} />
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
