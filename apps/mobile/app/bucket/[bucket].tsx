import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * M1 stub route — PR1 placeholder for `bucket/[bucket]` (US-056 D-12/T-03).
 * Resolves `router.push('/bucket/...')` calls from LeyendaGasto so the legend
 * rows navigate without crashing. This stub is REPLACED by the real
 * BucketDetalleScreen implementation in PR3 T-12.
 */
export default function BucketDetallePage() {
  const router = useRouter();

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>M1 stub</Text>
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
