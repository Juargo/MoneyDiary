import { Pressable, Text, View } from 'react-native';
import { COLORS } from '../../theme/colors';

export interface SelectorChipsProps<T extends string = string> {
  readonly label?: string;
  readonly options: readonly T[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly testID?: string;
}

/**
 * Generic radiogroup chip selector (US-044 PR3a, D-17).
 * Serves both Bucket selection and MatchType selection across configuration screens.
 */
export function SelectorChips<T extends string = string>({
  label,
  options,
  value,
  onChange,
  testID,
}: SelectorChipsProps<T>) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="text-sm font-medium text-heading">{label}</Text>
      ) : null}
      <View
        testID={testID}
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row flex-wrap gap-2"
      >
        {options.map((option) => {
          const seleccionada = option === value;

          return (
            <Pressable
              key={option}
              testID={testID ? `${testID}-${option}` : undefined}
              accessibilityRole="radio"
              accessibilityLabel={option}
              accessibilityState={{ checked: seleccionada }}
              onPress={() => onChange(option)}
              className="rounded-full border px-3.5 py-1.5"
              style={{
                backgroundColor: seleccionada ? COLORS.ingreso : COLORS.canvas,
                borderColor: COLORS.hairline,
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color: seleccionada ? '#ffffff' : COLORS.heading,
                }}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
