import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-semibold tracking-tight">MoneyDiary</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Frontend scaffold — React + Vite + Tailwind + TanStack
        </p>
      </div>
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        Sprint 1 cerrado · siguiente: persistencia backend ↔ DB
      </div>
    </main>
  )
}
