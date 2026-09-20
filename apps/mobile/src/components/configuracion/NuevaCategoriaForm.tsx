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
 *
 * Icon picker (categoria-iconografia, ADR-045, MCTG-02): `SelectorIcono`
 * renders after the Nombre/Bucket fields. The default "Sin icono" pick and
 * never touching the picker both mean "no icon" on CREATE (CATICO-02), so
 * `icono: icono ?? undefined` only sends the key when the user actually
 * chose one — mirrors web's `NuevaCategoriaForm.tsx` (4.4) verbatim.
 *
 * `bucketFijo` (agregar-categoria-desde-bucket, issue #743): when set, the
 * bucket is NOT a user choice — `SelectorChips` is not rendered at all, and
 * the value is shown as static `ETIQUETA_BUCKET` text instead, mirroring
 * web's `NuevaCategoriaDesdeFilaForm` (its own fixed-bucket caller
 * precedent). `bucket` state seeds from `bucketFijo` and never changes on
 * this path (no setter is ever wired to it). Omitted (every pre-existing
 * Configuración caller) keeps this component byte-for-byte the prior
 * user-picks-the-bucket behavior.
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { crearCategoria } from '../../api/categorias';
import type {
  BucketAsignable,
  IconoCategoria,
} from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { mensajeDeErrorCatalogo } from '../../domain/mensajes-catalogo';
import { ETIQUETA_BUCKET } from '../../theme/colors';
import { CampoTexto } from './CampoTexto';
import { SelectorChips } from './SelectorChips';
import { SelectorIcono } from './SelectorIcono';

export interface NuevaCategoriaFormProps {
  readonly onCreada: () => void;
  readonly onCancelar: () => void;
  readonly bucketFijo?: BucketAsignable;
}

export function NuevaCategoriaForm({
  onCreada,
  onCancelar,
  bucketFijo,
}: NuevaCategoriaFormProps) {
  const [nombre, setNombre] = useState('');
  const [bucket, setBucket] = useState<BucketAsignable | ''>(bucketFijo ?? '');
  const [icono, setIcono] = useState<IconoCategoria | null>(null);
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
      icono: icono ?? undefined,
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

      {bucketFijo ? (
        <View className="gap-1">
          <Text className="text-xs text-muted">Bucket</Text>
          <Text className="text-sm font-medium text-heading">
            {ETIQUETA_BUCKET[bucketFijo] ?? bucketFijo}
          </Text>
        </View>
      ) : (
        <SelectorChips
          testID="bucket-selector"
          label="Bucket (obligatorio)"
          options={BUCKETS_ASIGNABLES}
          value={bucket as BucketAsignable}
          onChange={(v) => setBucket(v)}
        />
      )}

      <SelectorIcono
        testID="icono-selector"
        value={icono}
        onChange={setIcono}
        disabled={enviando}
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
