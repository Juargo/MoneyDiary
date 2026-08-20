/**
 * CategoriaFila.tsx — US-044 PR5b, T5b.2
 *
 * List row for a single categoría. Read + navigate only (D-12):
 * - shows name + etiquetaPatrones(n) pattern count tag
 * - taps → router.push('/categoria/{id}')
 * - NO delete control: deletion lives on the edit screen (same as web at phone width)
 *
 * Pure presentation: no fetch, no env. Props in, JSX out.
 */
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CategoriaDto } from '../../domain/catalogo.types';
import { etiquetaPatrones } from '../../domain/plural';

export interface CategoriaFilaProps {
  readonly categoria: CategoriaDto;
}

export function CategoriaFila({ categoria }: CategoriaFilaProps) {
  const router = useRouter();
  const { id, nombre, patrones } = categoria;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nombre}
      onPress={() => router.push(`/categoria/${id}`)}
      className="flex-row items-center justify-between rounded-xl border border-hairline bg-white px-4 py-3"
    >
      <Text className="flex-1 text-base font-medium text-heading">
        {nombre}
      </Text>
      <View className="ml-2">
        <Text className="text-sm text-muted">
          {etiquetaPatrones(patrones.length)}
        </Text>
      </View>
    </Pressable>
  );
}
