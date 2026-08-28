/**
 * BrandBlock — the product's wordmark + tagline pair ("MoneyDiary" / "Tu mes,
 * un veredicto claro."), extracted so the two surfaces that show it
 * (`app-shell/Sidebar.tsx` for authenticated users, `routes/login.tsx` for
 * the pre-auth screen) never let the copy or its styling drift apart —
 * before this extraction the login screen had no brand presence at all
 * (impeccable critique round 7, P1). Purely presentational: no layout
 * wrapper (padding, centering) so each call site composes it into its own
 * container without fighting inherited spacing.
 *
 * `asHeading` (default `false`, fresh-review follow-up to the same finding):
 * `/login` is a full page with no other heading on it, so its wordmark
 * renders as the page's `<h1>` there. `Sidebar` sits inside `AppShell`,
 * where each routed page already owns its own `<h1>` — the sidebar's copy of
 * the wordmark stays a plain `<p>` so the document never gets two
 * competing `<h1>`s.
 */
export function BrandBlock({
  asHeading = false,
}: {
  readonly asHeading?: boolean;
}) {
  const Wordmark = asHeading ? 'h1' : 'p';
  return (
    <>
      <Wordmark className="text-lg font-semibold text-primary">
        MoneyDiary
      </Wordmark>
      <p className="text-xs text-muted-foreground">
        Tu mes, un veredicto claro.
      </p>
    </>
  );
}
