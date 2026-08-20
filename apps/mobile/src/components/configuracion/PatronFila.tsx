/**
 * PatronFila.tsx — US-044 PR7, T7.4 (GREEN)
 *
 * The 4-state row machine for a single classification pattern (design §1.12):
 *
 *   limpio   — valor === comprometido, confirm control hidden
 *   sucio    — dirty AND trimmed value ≠ '', confirm "Guardar patrón" visible
 *   enviando — mutation in flight, fields + controls disabled
 *   error    — inline role="alert" under the row; row stays sucio/retryable
 *
 * Rows commit independently of EditarCategoria's own Guardar (MCTG-04).
 *
 * New row (patron === null):
 *   - confirm → crearPatron; on success parent drops placeholder and re-fetches
 *   - delete  → discard with zero requests (no id, no DELETE possible)
 *
 * Existing row (patron !== null):
 *   - confirm → actualizarPatron; committed baseline advances ONLY on success
 *   - delete  → eliminarPatron with NO Alert.alert confirmation (a pattern
 *               touches no persisted transactions — design §1.12)
 *
 * `matchType` uses SelectorChips with getOptionLabel (ETIQUETA_MATCH_TYPE) —
 * binding obligation 1: getOptionLabel re-added in PR7 WITH a behavior test.
 *
 * `prioridad` is NEVER in any payload (binding decision 3) — tsc-enforced by
 * PatronInput/PatronPatch type definitions in categorias.ts.
 *
 * MCTG-07 negative-4: pattern mutations do NOT call solicitarRecargaResumen.
 * Pattern mutations never reclassify retroactively (classification runs at
 * ingesta time) and never touch bucketId (design §1.13, D-11).
 *
 * Props:
 *   patron          — existing PatronDto, or null for a new/uncommitted row
 *   categoriaId     — needed for crearPatron's payload
 *   onGuardado      — called after a successful save; parent triggers re-fetch
 *   onEliminado     — called after delete/discard; parent removes the row
 */
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import {
  crearPatron,
  actualizarPatron,
  eliminarPatron,
} from '../../api/categorias';
import type { MatchType } from '../../domain/catalogo-constantes';
import { MATCH_TYPES } from '../../domain/catalogo-constantes';
import {
  ETIQUETA_MATCH_TYPE,
  mensajeDeErrorCatalogo,
} from '../../domain/mensajes-catalogo';
import type { PatronDto } from '../../domain/catalogo.types';
import { SelectorChips } from './SelectorChips';

export interface PatronFilaProps {
  /**
   * Existing PatronDto for a committed row, or null for a new placeholder row.
   * null means no id exists — delete on a null row is a discard (zero requests).
   */
  readonly patron: PatronDto | null;
  readonly categoriaId: string;
  /** Called after a successful crearPatron or actualizarPatron. */
  readonly onGuardado: () => void;
  /** Called after a successful eliminarPatron OR after discarding a new row. */
  readonly onEliminado: () => void;
}

export function PatronFila({
  patron,
  categoriaId,
  onGuardado,
  onEliminado,
}: PatronFilaProps) {
  // Committed baseline — the last successfully saved values (or empty for new rows)
  const [comprometido, setComprometido] = useState({
    patron: patron?.patron ?? '',
    matchType: (patron?.matchType as MatchType | undefined) ?? MATCH_TYPES[0],
  });

  // Local draft — tracks edits before Guardar patrón
  const [patronDraft, setPatronDraft] = useState(comprometido.patron);
  const [matchType, setMatchType] = useState<MatchType>(comprometido.matchType);

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable testID for ORDER pinning in PatronesSection tests.
  // useState with no setter — value is computed once from props at mount and never changes.
  const [rowTestID] = useState(
    patron ? `patron-input-${patron.id}` : `patron-input-nuevo`,
  );

  // sucio: the trimmed value differs from the committed baseline
  const patronTrimmed = patronDraft.trim();
  const sucio =
    (patronTrimmed !== comprometido.patron ||
      matchType !== comprometido.matchType) &&
    patronTrimmed !== '';

  // REGEX hint — advisory only, never a gate (D-12)
  const esRegex = matchType === 'REGEX';
  let regexInvalido = false;
  if (esRegex && patronTrimmed !== '') {
    try {
      new RegExp(patronTrimmed);
    } catch {
      regexInvalido = true;
    }
  }

  async function handleGuardar() {
    if (enviando || !sucio) return;

    setEnviando(true);
    setError(null);

    let resultado;

    if (patron === null) {
      // New row — crearPatron (prioridad absent — binding decision 3)
      resultado = await crearPatron({
        categoriaId,
        patron: patronTrimmed,
        matchType,
      });
    } else {
      // Existing row — actualizarPatron (prioridad absent — binding decision 3)
      resultado = await actualizarPatron(patron.id, {
        patron: patronTrimmed,
        matchType,
      });
    }

    setEnviando(false);

    if (resultado.ok) {
      // Advance the committed baseline only on success — failed patch stays retryable
      setComprometido({ patron: patronTrimmed, matchType });
      onGuardado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  async function handleEliminar() {
    if (enviando) return;

    if (patron === null) {
      // New/uncommitted row — discard with zero requests (no id to DELETE)
      onEliminado();
      return;
    }

    // Existing row — DELETE without Alert.alert confirmation (design §1.12:
    // a pattern touches no persisted transactions — no warning needed).
    // Non-tautological (class 3): paired with EditarCategoria's categoria delete
    // which DOES call Alert.alert (PR6b). Different domain, different semantics.
    setEnviando(true);
    setError(null);

    const resultado = await eliminarPatron(patron.id);

    setEnviando(false);

    if (resultado.ok) {
      onEliminado();
    } else {
      setError(mensajeDeErrorCatalogo(resultado.error));
    }
  }

  return (
    <View className="gap-2 rounded-xl border border-hairline bg-white p-3">
      {/* Pattern text input */}
      <TextInput
        testID={rowTestID}
        accessibilityLabel="Texto del patrón"
        placeholder="Texto del patrón"
        value={patronDraft}
        onChangeText={setPatronDraft}
        editable={!enviando}
        className="text-sm text-heading"
      />

      {/* matchType chip selector — DISTINCT testID per row (binding obligation 2).
          getOptionLabel maps raw MatchType → ETIQUETA_MATCH_TYPE label (binding obligation 1).
          onChange emits the raw MatchType value, not the label. */}
      <SelectorChips
        testID={
          patron
            ? `matchtype-selector-${patron.id}`
            : `matchtype-selector-nuevo`
        }
        options={MATCH_TYPES}
        value={matchType}
        onChange={setMatchType}
        getOptionLabel={(opt) => ETIQUETA_MATCH_TYPE[opt]}
      />

      {/* REGEX hint — advisory text only, never blocks submission (D-12) */}
      {esRegex && regexInvalido ? (
        <Text className="text-xs text-amber-600">
          Esa expresión regular podría no ser válida.
        </Text>
      ) : null}

      {/* Error region — inline role="alert" (R5 pattern, subir.tsx:230-238 idiom) */}
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

      {/* Controls row */}
      <View className="flex-row gap-2">
        {/* Guardar patrón — confirm control, hidden when limpio */}
        {sucio ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Guardar patrón"
            accessibilityState={{ disabled: enviando }}
            onPress={() => void handleGuardar()}
            disabled={enviando}
            className="flex-1 rounded-lg bg-ingreso px-3 py-2"
          >
            <Text className="text-center text-xs font-medium text-white">
              {enviando ? 'Guardando…' : 'Guardar patrón'}
            </Text>
          </Pressable>
        ) : null}

        {/* Eliminar patrón — always visible */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Eliminar patrón"
          accessibilityState={{ disabled: enviando }}
          onPress={() => void handleEliminar()}
          disabled={enviando}
          className="rounded-lg border border-hairline bg-white px-3 py-2"
        >
          <Text className="text-center text-xs font-medium text-red-600">
            Eliminar patrón
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
