import { Pressable, Text, View } from 'react-native';
import type { ApiError } from '../../api/client';
import { copiaPorApiError } from '../../api/client';

/**
 * Error state (MOB-02/MOB-03): copy differs subtly by `ApiError` tag so
 * the user gets an accurate hint (network vs auth vs malformed response),
 * but every tag is still the same "error" branch of the 4-way switch.
 * Always renders a retry affordance — the screen must never leave the
 * user stuck after a failure. Copy itself lives in `copiaPorApiError`
 * (client.ts, review readability fix #7, DRY) — shared with `app/subir.tsx`.
 */
export function ErrorState({
  error,
  onRetry,
}: {
  readonly error: ApiError;
  readonly onRetry: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas px-8">
      <Text className="text-center text-base text-heading">{copiaPorApiError(error)}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="rounded-full bg-ingreso px-6 py-3"
      >
        <Text className="font-semibold text-white">Reintentar</Text>
      </Pressable>
    </View>
  );
}
