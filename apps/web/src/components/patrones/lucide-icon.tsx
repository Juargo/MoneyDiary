import { Tag } from 'lucide-react'
import { getIconComponent } from './icon-catalog'

type Props = {
  name: string | null | undefined
  className?: string
  fallback?: boolean
}

export function LucideIcon({ name, className, fallback = false }: Props) {
  const Icon = getIconComponent(name)
  if (!Icon) {
    if (!fallback) return null
    return <Tag className={className} aria-hidden />
  }
  return <Icon className={className} aria-hidden />
}
