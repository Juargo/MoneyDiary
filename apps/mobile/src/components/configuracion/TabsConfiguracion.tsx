import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';

export type TabConfiguracion = 'perfil' | 'categorias';

export interface TabsConfiguracionProps {
  readonly tabActiva: TabConfiguracion;
  readonly onCambiarTab: (tab: TabConfiguracion) => void;
  readonly testID?: string;
}

/**
 * Segmented control for Configuración screen tabs (US-044 PR3b, D-01).
 * Pure presentational component with local state controlled by the parent route.
 */
export function TabsConfiguracion({
  tabActiva,
  onCambiarTab,
  testID = 'tabs-configuracion',
}: TabsConfiguracionProps) {
  const tabs: readonly { key: TabConfiguracion; label: string }[] = [
    { key: 'perfil', label: 'Perfil' },
    { key: 'categorias', label: 'Categorías' },
  ];

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      className="flex-row rounded-xl border border-hairline bg-white p-1"
    >
      {tabs.map(({ key, label }) => {
        const activa = tabActiva === key;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: activa }}
            onPress={() => onCambiarTab(key)}
            className="flex-1 items-center rounded-lg py-2"
            style={{
              backgroundColor: activa ? COLORS.ingreso : 'transparent',
            }}
          >
            <Text
              className="text-sm font-medium"
              style={{
                color: activa ? '#ffffff' : COLORS.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
