type TipCardProps = {
  badge: string
  title: string
  description: string
  ctaLabel: string
  onCtaClick?: () => void
}

export function TipCard({
  badge,
  title,
  description,
  ctaLabel,
  onCtaClick,
}: TipCardProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-inverse-surface p-6 text-inverse-on-surface">
      <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
        <div className="space-y-3">
          <span className="inline-block rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-on-primary">
            {badge}
          </span>
          <h4 className="text-lg font-semibold text-inverse-primary">{title}</h4>
          <p className="max-w-md text-sm text-inverse-on-surface/70">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={onCtaClick}
          className="shrink-0 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-on-primary shadow-lg transition-opacity hover:opacity-90"
        >
          {ctaLabel}
        </button>
      </div>

      <div className="pointer-events-none absolute -bottom-10 -right-10 size-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 -top-10 size-32 rounded-full bg-secondary/10 blur-2xl" />
    </section>
  )
}
