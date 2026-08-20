/**
 * NuevaCategoriaForm.tsx — US-044 PR5c, T5c.2
 *
 * Inline form for creating a new category at the top of the Categorías list.
 * A not-yet-created category has no id and cannot own patterns — it must be
 * created here before it can be navigated to for editing (design §1.10).
 *
 * Props:
 *   onCreada   — called on success; the parent (CategoriasPanel/route) uses
 *                this to re-fetch the catalog (D-10: useFocusEffect on the
 *                route, or a direct callback here to avoid prop-drilling through
 *                configuracion.tsx — the route's fetchCatalogo is passed down).
 *   onCancelar — called when the user taps Cancelar, so CategoriasPanel can
 *                toggle the form closed without knowing the form's internal state.
 *
 * Validation rules:
 *   - nombre must be non-empty (trimmed) before submit
 *   - bucket must be selected (non-empty string) before submit
 *   Both fields together gate the submit button; individual field errors are
 *   surfaced only after a submit attempt.
 *
 * Freshness: success calls onCreada only — no solicitarRecargaResumen().
 * Creation does not move any peso between buckets (D-11/MCTG-07).
 *
 * Error copy: mensajeDeErrorCatalogo (mensajes-catalogo.ts) — never the server
 * message string (anti-enumeration).
 *
 * No fetch, no env in this file. crearCategoria is the only API call.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { crearCategoria } from '../../api/categorias';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { mensajeDeErrorCatalogo } from '../../domain/mensajes-catalogo';
import { CampoTexto } from './CampoTexto';
import { SelectorChips } from './SelectorChips';

export interface NuevaCategoriaFormProps {
  readonly onCreada: () => void;
  readonly onCancelar: () => void;
}

export function NuevaCategoriaForm({
  onCreada,
  onCancelar,
}: NuevaCategoriaFormProps) {
  const [nombre, setNombre] = useState('');
  const [bucket, setBucket] = useState<BucketAsignable | ''>('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombreValido = nombre.trim().length > 0;
  const bucketValido = bucket !== '';
  const puedeGuardar = nombreValido && bucketValido && !enviando;

  async function handleGuardar() {
    // Narrow bucket explicitly: the empty-string sentinel means 'unselected'.
    // Using a local const so tsc CFA can narrow from the type guard below.
    const bucketSeleccionado: BucketAsignable | '' = bucket;
    const nombreTrimmed = nombre.trim();
    if (!nombreTrimmed || !bucketSeleccionado) return;

    setEnviando(true);
    setError(null);

    const resultado = await crearCategoria({
      nombre: nombreTrimmed,
      bucket: bucketSeleccionado,
    });

    setEnviando(false);

    if (resultado.ok) {
      onCreada();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  return (
    <View
      testID="nueva-categoria-form"
      className="gap-3 rounded-xl border border-hairline bg-white p-4"
    >
      <CampoTexto
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        editable={!enviando}
      />

      <SelectorChips
        testID="bucket-selector"
        label="Bucket (obligatorio)"
        options={BUCKETS_ASIGNABLES}
        value={bucket as BucketAsignable}
        onChange={(v) => setBucket(v)}
      />

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessible={true}
          className="text-xs text-red-600"
        >
          {error}
        </Text>
      ) : null}

      <View className="flex-row gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar"
          accessibilityState={{ disabled: !puedeGuardar }}
          onPress={() => void handleGuardar()}
          disabled={!puedeGuardar}
          className="flex-1 rounded-xl bg-ingreso px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-white">
            {enviando ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          onPress={onCancelar}
          disabled={enviando}
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-heading">
            Cancelar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
