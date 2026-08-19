import { Text, TextInput, View } from 'react-native';

export interface CampoTextoProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly secureTextEntry?: boolean;
  readonly error?: string;
  readonly placeholder?: string;
  readonly testID?: string;
  readonly autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  readonly keyboardType?: 'default' | 'email-address' | 'numeric' | 'phone-pad';
  readonly editable?: boolean;
}

/**
 * Controlled text input wrapper with label and optional error message (US-044 PR3a).
 * Accessible by label name and exposes alert role on errors.
 */
export function CampoTexto({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  error,
  placeholder,
  testID,
  autoCapitalize,
  keyboardType,
  editable = true,
}: CampoTextoProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-heading">{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        editable={editable}
        className="rounded-xl border border-hairline bg-white px-4 py-3 text-heading"
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-xs text-red-600">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
