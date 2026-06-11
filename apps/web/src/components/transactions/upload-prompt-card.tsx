import { UploadCloud } from 'lucide-react'

type UploadPromptCardProps = {
  title: string
  description: string
  ctaLabel: string
  onCtaClick?: () => void
}

export function UploadPromptCard({
  title,
  description,
  ctaLabel,
  onCtaClick,
}: UploadPromptCardProps) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-outline-variant bg-surface-container-lowest px-8 py-12 text-center">
      <div className="mb-6 flex size-14 items-center justify-center rounded-full bg-surface-container">
        <UploadCloud
          className="size-6 text-on-surface-variant"
          strokeWidth={1.75}
        />
      </div>

      <h3 className="text-xl font-bold text-on-surface">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-on-surface-variant">
        {description}
      </p>

      <button
        type="button"
        onClick={onCtaClick}
        className="mt-6 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-on-primary shadow-md transition-opacity hover:opacity-90"
      >
        {ctaLabel}
      </button>
    </div>
  )
}
