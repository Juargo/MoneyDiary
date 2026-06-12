import { useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import type { MatchType, Patron, PatronInput } from '@/api/patrones'
import { IconPicker } from './icon-picker'

const BUCKETS = ['Necesidades', 'Gustos', 'Ahorro', 'SinCategorizar'] as const
const MATCH_TYPES: MatchType[] = ['CONTAINS', 'STARTS_WITH', 'REGEX']

type Props = {
  open: boolean
  initial?: Patron | null
  saving: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (input: PatronInput) => void
}

export function PatronFormModal({
  open,
  initial,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [bucketName, setBucketName] = useState<string>(BUCKETS[0])
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [expression, setExpression] = useState('')
  const [matchType, setMatchType] = useState<MatchType>('CONTAINS')
  const [priority, setPriority] = useState<number>(100)
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!open) return
    setBucketName(initial?.bucketName ?? BUCKETS[0])
    setLabel(initial?.label ?? '')
    setIcon(initial?.icon ?? null)
    setExpression(initial?.expression ?? '')
    setMatchType(initial?.matchType ?? 'CONTAINS')
    setPriority(initial?.priority ?? 100)
    setActive(initial?.active ?? true)
  }, [open, initial])

  if (!open) return null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit({
      bucketName,
      label: label.trim() || null,
      icon,
      expression: expression.trim(),
      matchType,
      priority,
      active,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg space-y-4 rounded-2xl bg-surface p-6 text-on-surface shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {initial ? 'Editar patrón' : 'Nuevo patrón'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-on-surface/10"
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <Field label="Etiqueta visible (ej: Uber, Netflix)">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-on-surface/20 bg-background px-3 py-2"
            placeholder="Uber"
          />
        </Field>

        <Field label="Icono">
          <IconPicker value={icon} onChange={setIcon} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Bucket">
            <select
              value={bucketName}
              onChange={(e) => setBucketName(e.target.value)}
              className="w-full rounded-md border border-on-surface/20 bg-background px-3 py-2"
            >
              {BUCKETS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Tipo de match">
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as MatchType)}
              className="w-full rounded-md border border-on-surface/20 bg-background px-3 py-2"
            >
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Expresión">
          <input
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className="w-full rounded-md border border-on-surface/20 bg-background px-3 py-2 font-mono text-sm"
            placeholder={
              matchType === 'REGEX' ? 'uber|cabify' : 'uber'
            }
            required
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            {matchType === 'REGEX'
              ? 'Regex case-insensitive (sin slashes).'
              : matchType === 'STARTS_WITH'
                ? 'La descripción debe empezar con este texto.'
                : 'La descripción debe contener este texto.'}
          </p>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridad (menor = primero)">
            <input
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
              className="w-full rounded-md border border-on-surface/20 bg-background px-3 py-2"
              required
            />
          </Field>

          <label className="flex items-end gap-2">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm">Activo</span>
          </label>
        </div>

        {error && (
          <p className="rounded-md border border-error/40 bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md px-4 py-2 text-sm hover:bg-on-surface/10"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}
