import { Shield, Lock, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Feature = {
  icon: LucideIcon
  label: string
}

const features: Feature[] = [
  { icon: Shield, label: 'Sin registro. Privacidad total.' },
  { icon: Lock, label: 'Sin contraseñas de banco.' },
  { icon: Zap, label: 'Resultados instantáneos.' },
]

export function UploadFeatures() {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low px-6 py-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {features.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon
              className="size-5 shrink-0 text-on-surface-variant"
              strokeWidth={1.75}
            />
            <span className="text-sm font-semibold text-on-surface">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
