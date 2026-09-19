import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { COLORS } from '../theme/colors';

/**
 * Top app bar: a lucide Settings gear navigating to /configuracion, the
 * current-period title, and a user avatar (inert image).
 *
 * The gear (US-044 PR8, T8.4) replaces the inert ☰ stub (design §1.14, D-02).
 * D-02: the avatar is decorative and stays untouched — turning it into a
 * control would create a competing "profile" concept on the same bar.
 *
 * D-18 (US-044): both new routes (/configuracion, /categoria/[id]) were
 * registered in _layout.tsx (PR3b T3b.1) but UI-unreachable until this gear
 * landed. Every PR1–PR7 slice was inert dead code on main; this PR lifts the
 * constraint and makes the Configuración feature reachable for the first time.
 */
export function Header({
  periodoLabel,
  mesEnCurso = false,
  iniciales = 'JD',
}: {
  periodoLabel: string;
  mesEnCurso?: boolean;
  iniciales?: string;
}) {
  const router = useRouter();

  return (
    <View className="flex-row items-center justify-between px-5 py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Configuración"
        hitSlop={12}
        onPress={() => router.push('/configuracion')}
      >
        {/* Settings icon imported per-icon (not via barrel), tree-shaken by Metro. */}
        <Settings size={24} color={COLORS.heading} />
      </Pressable>

      {/* issue #747 PR3: `accessible` groups the label + the "Mes en curso"
          marker into ONE accessible node ("agosto 2026, Mes en curso")
          instead of two separate stops for a screen reader — mirrors web's
          Badge sitting next to the label (PeriodoSelector.tsx). The marker
          is conveyed as TEXT, never color alone (WCAG 1.4.1, ADR-018). */}
      <View
        accessible={true}
        accessibilityRole="header"
        accessibilityLabel={
          mesEnCurso ? `${periodoLabel}, Mes en curso` : periodoLabel
        }
        className="items-center gap-1"
      >
        <Text
          testID="header-periodo-label"
          className="text-lg font-bold text-heading"
        >
          {periodoLabel}
        </Text>
        {mesEnCurso && (
          <View className="rounded-full bg-canvas px-2.5 py-0.5">
            <Text className="text-xs font-semibold text-ingreso">
              Mes en curso
            </Text>
          </View>
        )}
      </View>

      <View
        accessibilityRole="image"
        accessibilityLabel="Perfil"
        className="h-9 w-9 items-center justify-center rounded-full bg-avatar"
      >
        <Text className="text-xs font-bold text-white">{iniciales}</Text>
      </View>
    </View>
  );
}
