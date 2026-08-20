import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * M2 stub route — PR1 placeholder for `ingresos` (US-056 D-12/T-03).
 * Resolves `router.push('/ingresos...')` calls from LeyendaGasto so the
 * Ingresos legend row navigates without crashing. This stub is REPLACED by
 * the real IngresosMesScreen implementation in PR5 T-17.
 */
export default function IngresosMesPage() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>M2 stub</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver al resumen"
        onPress={() => router.back()}
      >
        <Text>Volver</Text>
      </Pressable>
    </View>
  );
}
