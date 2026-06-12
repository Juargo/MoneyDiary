import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GrupoPresupuesto } from '@/api/types'
import { useUpdateGrupo } from '@/api/use-update-grupo'
import { LucideIcon } from '@/components/patrones/lucide-icon'

type EditableCategoryChipProps = {
  transactionId: string
  label: string
  grupo: GrupoPresupuesto
  icon?: string | null
}

const grupoStyles: Record<GrupoPresupuesto, string> = {
  Ingresos: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  Necesidades: 'bg-primary-fixed text-on-primary-fixed-variant',
  Gustos: 'bg-secondary-fixed text-on-secondary-fixed-variant',
  Ahorro: 'bg-surface-container-highest text-on-surface',
  SinCategorizar: 'bg-surface-container-high text-on-surface-variant',
}

const grupoLabels: Record<GrupoPresupuesto, string> = {
  Ingresos: 'Ingresos',
  Necesidades: 'Necesidades',
  Gustos: 'Gustos',
  Ahorro: 'Ahorro',
  SinCategorizar: 'Sin categorizar',
}

const grupoSwatch: Record<GrupoPresupuesto, string> = {
  Ingresos: 'bg-tertiary',
  Necesidades: 'bg-primary',
  Gustos: 'bg-secondary',
  Ahorro: 'bg-on-surface',
  SinCategorizar: 'bg-outline',
}

const OPCIONES_EDITABLES: GrupoPresupuesto[] = [
  'Necesidades',
  'Gustos',
  'Ahorro',
  'SinCategorizar',
]

const MENU_WIDTH = 176
const MENU_GAP = 4

export function CategoryChip({
  label,
  grupo,
  icon,
}: {
  label: string
  grupo: GrupoPresupuesto
  icon?: string | null
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        grupoStyles[grupo],
      )}
    >
      {icon && <LucideIcon name={icon} className="size-3.5" />}
      {label}
    </span>
  )
}

export function EditableCategoryChip({
  transactionId,
  label,
  grupo,
  icon,
}: EditableCategoryChipProps) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  )
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const mutation = useUpdateGrupo()

  const editable = grupo !== 'Ingresos'

  const computePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewportWidth = window.innerWidth
    const left = Math.min(rect.left, viewportWidth - MENU_WIDTH - 8)
    setMenuPos({ top: rect.bottom + MENU_GAP, left: Math.max(8, left) })
  }

  useEffect(() => {
    if (!open) return
    computePosition()

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        !triggerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function handleScrollOrResize() {
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  if (!editable) {
    return <CategoryChip label={label} grupo={grupo} icon={icon} />
  }

  const handleSelect = (nuevoGrupo: GrupoPresupuesto) => {
    setOpen(false)
    if (nuevoGrupo === grupo) return
    mutation.mutate({ id: transactionId, grupo: nuevoGrupo })
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={mutation.isPending}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-opacity',
          grupoStyles[grupo],
          'hover:ring-1 hover:ring-outline-variant disabled:opacity-60',
        )}
      >
        {icon && <LucideIcon name={icon} className="size-3.5" />}
        <span>{label}</span>
        <ChevronDown className="size-3" strokeWidth={2.5} />
      </button>

      {open &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: MENU_WIDTH,
              zIndex: 50,
            }}
            className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container-low shadow-lg"
          >
            {OPCIONES_EDITABLES.map((g) => (
              <button
                key={g}
                type="button"
                role="menuitem"
                onClick={() => handleSelect(g)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-container',
                  g === grupo && 'font-semibold',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-2 shrink-0 rounded-full',
                    grupoSwatch[g],
                  )}
                />
                <span className="flex-1 text-on-surface">{grupoLabels[g]}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
