/**
 * EditarCategoria.tsx — US-044 PR6b, T6b.4 (extended from PR6a T6a.4)
 *
 * Identity form (Nombre + Bucket) + footer (Guardar / Cancelar / Eliminar).
 *
 * PR6b wires both Alert.alert confirmation flows (design §1.11, MCTG-03/MCTG-05):
 *
 *   bucket clean  → patchCategoria({nombre, bucket}) directly (unchanged from PR6a)
 *   bucket dirty  → Alert.alert(fraseDeImpacto({tipo:'cambiar-bucket', …}))
 *                   → confirm → patch → solicitarRecargaResumen() (MCTG-07 positive)
 *                   → cancel  → zero requests
 *
 *   Eliminar      → Alert.alert(fraseDeImpacto({tipo:'eliminar-categoria', …}))
 *                   → confirm → eliminarCategoria (no solicitarRecargaResumen — D-11)
 *                   → cancel  → zero requests
 *
 * Two web mechanisms are deliberately NOT ported (D-15):
 *   - snapshotAlAbrirDialogo freeze — Alert.alert IS a native modal; the OS
 *     blocks all interaction beneath it, so nothing can move. Reading values
 *     at the moment Alert.alert is called IS the freeze.
 *   - disabled/focus-restore matrix — the non-modal dialog they guarded
 *     does not exist here.
 *
 * transaccionesCount is read from the already-loaded DTO — never re-fetched
 * (design §1.11, T6b.5 refactor requirement).
 *
 * PatronesSection renders a placeholder until PR7 wires the real component.
 *
 * Props:
 *   categoria    — the resolved CategoriaDto from the route
 *   onGuardado   — called after a successful save (route re-fetches catalog)
 *   onCancelar   — called on Cancelar (route navigates back)
 *   onEliminado  — called after a successful delete (route navigates back)
 */
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { actualizarCategoria, eliminarCategoria } from '../../api/categorias';
import { solicitarRecargaResumen } from '../../api/resumen-refresh';
import type { BucketAsignable } from '../../domain/catalogo-constantes';
import { BUCKETS_ASIGNABLES } from '../../domain/catalogo-constantes';
import { fraseDeImpacto } from '../../domain/impacto-catalogo';
import { mensajeDeErrorCatalogo } from '../../domain/mensajes-catalogo';
import type { CategoriaDto } from '../../domain/catalogo.types';
import { CampoTexto } from './CampoTexto';
import { SelectorChips } from './SelectorChips';

export interface EditarCategoriaProps {
  readonly categoria: CategoriaDto;
  /** Called after a successful Guardar so the parent route can re-fetch */
  readonly onGuardado: () => void;
  /** Called on Cancelar — navigates back without saving (WCTG-04) */
  readonly onCancelar: () => void;
  /** Called after a successful Eliminar — navigates back */
  readonly onEliminado: () => void;
}

export function EditarCategoria({
  categoria,
  onGuardado,
  onCancelar,
  onEliminado,
}: EditarCategoriaProps) {
  // Identity draft — seeded from the resolved row, local until Guardar
  const [nombre, setNombre] = useState(categoria.nombre);
  const [bucket, setBucket] = useState<BucketAsignable>(
    // Cast: the DTO's bucket is a string; BUCKETS_ASIGNABLES includes the
    // canonical values. Only null/undefined falls back to BUCKETS_ASIGNABLES[0]
    // (D-07: unknown non-empty bucket values pass through as-is so the user
    // can see and correct them; we use ?? not || to avoid replacing '' with the
    // fallback — an empty string is already invalid and will be visible).
    (categoria.bucket as BucketAsignable) ?? BUCKETS_ASIGNABLES[0],
  );

  // Split in-flight label semantics: 'guardar' shows "Guardando…", 'eliminar'
  // shows "Eliminando…". Both buttons are disabled during ANY in-flight op.
  const [operacion, setOperacion] = useState<'guardar' | 'eliminar' | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const enviando = operacion !== null;

  const bucketOriginal =
    (categoria.bucket as BucketAsignable) ?? BUCKETS_ASIGNABLES[0];
  const bucketCambiado = bucket !== bucketOriginal;

  /**
   * Execute the actual bucket-change PATCH after Alert confirmation.
   * Called from the Alert's destructive button onPress.
   * Fires solicitarRecargaResumen() only on success (D-11, MCTG-07 positive).
   */
  async function confirmarCambiarBucket() {
    setOperacion('guardar');
    setError(null);

    const resultado = await actualizarCategoria(categoria.id, {
      nombre: nombre.trim(),
      bucket,
    });

    setOperacion(null);

    if (resultado.ok) {
      // Bucket change re-stamps transacciones' bucketId — resumen buckets shift
      // (actualizar-categoria.use-case.ts:38-39, D-11). Fire the refresh.
      solicitarRecargaResumen();
      onGuardado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  async function handleGuardar() {
    if (enviando) return;

    if (bucketCambiado) {
      // bucket-dirty: show impact confirmation before patching (MCTG-03)
      const { titulo, lineas, textoConfirmar } = fraseDeImpacto({
        tipo: 'cambiar-bucket',
        nombre: categoria.nombre,
        transaccionesCount: categoria.transaccionesCount,
        bucketAnterior: bucketOriginal,
        bucketNuevo: bucket,
      });
      Alert.alert(titulo, lineas.join('\n'), [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: textoConfirmar,
          style: 'destructive',
          onPress: () => void confirmarCambiarBucket(),
        },
      ]);
      return;
    }

    // Bucket clean: send the patch directly, no confirmation needed
    setOperacion('guardar');
    setError(null);

    const resultado = await actualizarCategoria(categoria.id, {
      nombre: nombre.trim(),
      bucket,
    });

    setOperacion(null);

    if (resultado.ok) {
      onGuardado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  /**
   * Execute the actual delete after Alert confirmation.
   * Called from the Alert's destructive button onPress.
   * Does NOT fire solicitarRecargaResumen — delete leaves bucketId untouched
   * (eliminar-categoria.use-case.ts:14-18, D-11, MCTG-07 negative-3).
   */
  async function confirmarEliminar() {
    setOperacion('eliminar');
    setError(null);

    const resultado = await eliminarCategoria(categoria.id);

    setOperacion(null);

    if (resultado.ok) {
      onEliminado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  async function handleEliminar() {
    if (enviando) return;

    // Show delete impact confirmation (MCTG-05).
    // transaccionesCount comes from the already-loaded DTO — never re-fetched
    // (design §1.11: "never a fresh fetch — MCTG-05").
    const { titulo, lineas, textoConfirmar } = fraseDeImpacto({
      tipo: 'eliminar-categoria',
      nombre: categoria.nombre,
      transaccionesCount: categoria.transaccionesCount,
    });
    Alert.alert(titulo, lineas.join('\n'), [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: textoConfirmar,
        style: 'destructive',
        onPress: () => void confirmarEliminar(),
      },
    ]);
  }

  return (
    <View className="gap-4">
      {/* Identity form */}
      <CampoTexto
        label="Nombre"
        value={nombre}
        onChangeText={setNombre}
        editable={!enviando}
      />

      {/* Bucket selector — distinct testID required when multiple SelectorChips
          exist on the same screen (binding constraint from PR3a's gate) */}
      <SelectorChips
        testID="bucket-selector"
        label="Bucket (obligatorio)"
        options={BUCKETS_ASIGNABLES}
        value={bucket}
        onChange={(v) => setBucket(v)}
      />

      {/* Error region — post-confirm failures render here (R5, design §1.11) */}
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

      {/* PatronesSection placeholder — replaced by real component in PR7 */}
      <View testID="patrones-placeholder" />

      {/* Footer: Guardar / Cancelar / Eliminar */}
      <View className="gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Guardar"
          accessibilityState={{ disabled: enviando }}
          onPress={() => void handleGuardar()}
          disabled={enviando}
          className="rounded-xl bg-ingreso px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-white">
            {operacion === 'guardar' ? 'Guardando…' : 'Guardar'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancelar"
          accessibilityState={{ disabled: enviando }}
          onPress={onCancelar}
          disabled={enviando}
          className="rounded-xl border border-hairline bg-white px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-heading">
            Cancelar
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eliminar categoría"
          accessibilityState={{ disabled: enviando }}
          onPress={() => void handleEliminar()}
          disabled={enviando}
          className="rounded-xl border border-hairline bg-white px-4 py-3"
        >
          <Text className="text-center text-sm font-medium text-red-600">
            {operacion === 'eliminar' ? 'Eliminando…' : 'Eliminar categoría'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
