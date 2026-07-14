import { Pressable, Text, View } from 'react-native';
import type { ApiError } from '../../api/client';

/**
 * Error state (MOB-02/MOB-03): copy differs subtly by `ApiError` tag so
 * the user gets an accurate hint (network vs auth vs malformed response),
 * but every tag is still the same "error" branch of the 4-way switch.
 * Always renders a retry affordance — the screen must never leave the
 * user stuck after a failure.
 */
function copiaPorError(error: ApiError): string {
  switch (error.tag) {
    case 'network':
      return 'Problema de conexión. Revisa tu internet e intenta de nuevo.';
    case 'unauthorized':
      return 'No se pudo verificar el acceso. Intenta de nuevo más tarde.';
    case 'parse':
      return 'Respuesta inesperada del servidor.';
    case 'http':
      return `Error del servidor (código ${error.status}).`;
  }
}

export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: ApiError;
  readonly onRetry: () => void;
}) {
  return (
    <View>
      <Text>{copiaPorError(error)}</Text>
      <Pressable onPress={onRetry}>
        <Text>Reintentar</Text>
      </Pressable>
    </View>
  );
}
