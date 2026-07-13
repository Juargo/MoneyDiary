import { Text, View } from 'react-native';

/**
 * Componente mínimo de ejemplo para ejercitar React Native Testing Library.
 * Existe solo como semilla del arnés de pruebas de componentes (ADR-017).
 */
export function Saludo({ nombre }: { nombre: string }) {
  return (
    <View>
      <Text>Hola, {nombre}</Text>
    </View>
  );
}
