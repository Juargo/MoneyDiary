export function DataVizPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="h-48 overflow-hidden rounded-xl border border-outline-variant bg-surface-container"
    >
      <svg
        className="size-full opacity-40"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="wave" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#74777f" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#74777f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 24 }).map((_, i) => (
          <path
            key={i}
            d={`M0 ${100 + i * 1.5} Q 100 ${60 + i * 2.5} 200 ${100 + i * 1.5} T 400 ${100 + i * 1.5}`}
            stroke="url(#wave)"
            strokeWidth="0.6"
            fill="none"
          />
        ))}
      </svg>
    </div>
  )
}
