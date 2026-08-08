# Design — auth-google-login

**Inputs:** `proposal.md` (locked product decisions Q1–Q6), `specs/user-authentication/spec.md` (AUTH-11…AUTH-18), `specs/mobile-session-auth/spec.md` (MOB-05), `specs/api-access-control/spec.md`, `docs/adr/ADR-034-login-con-google-oidc.md`, and the live code in `apps/api` / `apps/web`.

**This document owns proposal risks 1–10.** It does not reopen any locked product decision (login-only, credential-presence activation, generic errors, coexistence without link management, web + mobile scope).

**Reading order:** §1 gives the shape. §2–§10 are the decisions (each states the choice, the evidence, the rejected alternatives, and the residual risk). §11 is testing, §12 the delivery slices, §13 what still needs the user.

**Baseline caveat.** This document cites two distinct groups of requirement IDs. The first is genuine **baseline anchors**: `AUTH-01/02/05/06`, `AC-07`, `MOB-01/02` — these live in `openspec/changes/auth-login-session/`, a change that was **never archived**. `openspec/specs/` (the archived baseline) has no `user-authentication` or `mobile-session-auth` spec at all, and its `api-access-control` spec only goes up to `AC-05`. Every baseline ID was **verified against live code this session** (not assumed from the unarchived text), so the requirements themselves are trustworthy, but their numbers are not yet part of the permanent baseline. Archiving `auth-login-session` (or reconstructing the base specs) is a prerequisite flagged for `sdd-verify`; if archival renumbers requirements, IDs cited here may shift. No renumbering is done in this document.

The second group is **new IDs minted by this change** that continue the same numbering: `AUTH-11..18`, `MOB-05`, `AC-09/10`. These describe a feature that does not exist in live code yet, so there is nothing to "verify against live code" for them — they are this change's own requirements, defined in its spec deltas.

---

## 1. Architecture at a glance

Nothing new is invented. The flow is the **demo flow's redirect shape** (`GET /api/auth/demo`: Sec-Fetch guard → 302 → backend-set cookie) with an OIDC round trip inserted in the middle, and the **password login's session issuance** at the end.

```
browser (app.moneydiary.cl/login)
  │  <a href="/api/auth/google">                          top-level navigation
  ▼
Vercel proxy (apps/web/api/proxy.ts) ──injects x-api-key, relays x-fwd-sec-fetch-*──▶ API
  │                                                        GET /api/auth/google
  │   ┌ Sec-Fetch top-level guard (403)
  │   ├ IpRateLimiter "google:ip:" (429)
  │   ├ verificador.iniciar() → { urlAutorizacion, state, nonce, codeVerifier }
  │   └ Set-Cookie md_oauth (Lax, HttpOnly, 10 min, Path=/api/auth/google)
  ◀── 302 Location: https://accounts.google.com/... ──────  (proxy does NOT follow)
  │
  ▼  user consents at Google
accounts.google.com ── 302 ──▶ https://app.moneydiary.cl/api/auth/google/callback?code&state
  │                                                        (cross-site top-level nav;
  │                                                         md_oauth is Lax ⇒ sent)
  ▼
Vercel proxy ──────────────────────────────────────────▶  API
                                                          GET /api/auth/google/callback
      ┌ read + immediately clear md_oauth
      ├ query.state === cookie.state ? (else generic fail)
      ├ verificador.verificar() → openid-client authorizationCodeGrant
      │     (validates code, PKCE, id_token signature/iss/aud/exp/nonce)
      ├ LoginConGoogleUseCase → find by googleSub → else link by emailBlindIndex
      └ Set-Cookie md_session (Strict, HttpOnly, 7d) + 302 Location: /
  ▼
browser loads / (static) → SPA boots → _authenticated beforeLoad → fetch('/api/auth/me')
                                        ↑ same-site subresource ⇒ Strict cookie IS sent
```

Layer map (ADR-005 dependency rule holds — `domain ← application ← infrastructure`):

| Layer | New artifacts |
|-------|---------------|
| `domain/errors/` | `login-con-google-fallido.error.ts` |
| `application/ports/` | `verificador-identidad-externa.port.ts` (2 role interfaces), `identidad-google-repository.port.ts` |
| `application/use-cases/` | `login-con-google.use-case.ts` |
| `infrastructure/oidc/` | `openid-client-google.adapter.ts` (the ONLY file that imports `openid-client`) |
| `infrastructure/persistence/` | `prisma-identidad-google.repository.ts` |
| `infrastructure/http/auth/` | `oauth-transient-cookie.ts`, `ip-rate-limiter.ts` (rename of `demo-rate-limiter.ts`) |
| `infrastructure/http-express/routes/` | `auth-google.routes.ts`, `auth-capabilities.routes.ts` |
| `composition/` | `crear-auth-google.ts`, `container.googleAuth?` |
| `config/` | `env.ts` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` |
| `apps/web` | `GoogleLoginButton.tsx`, `api/capabilities.ts`, `routes/login.tsx` `validateSearch` |

Neither `domain/` nor `application/` gains a single import of `openid-client`, Express, or Prisma.

---

## 2. D1 — `SameSite=Strict` and the cross-site callback landing (proposal risk 1)

**Decision: keep `md_session` exactly as it is — `SameSite=Strict`, host-only, `HttpOnly`, `Secure` in prod. No intermediate hop, no interstitial, no Lax variant, no change to `cookie.ts`.**

### Why the risk does not materialise here

Two distinct browser behaviours were conflated in the proposal:

1. **Storing** a cookie from a response to a cross-site-initiated top-level navigation. `SameSite` constrains when a cookie is *sent*, not whether a `Set-Cookie` on a top-level navigation response is *accepted*. The callback response is a top-level navigation to `app.moneydiary.cl`, so its site-for-cookies is `app.moneydiary.cl` — the cookie is stored.
2. **Sending** the cookie on the immediate `302 → /`. Here the proposal is right: the redirect chain originated at `accounts.google.com`, so browsers treat that navigation as cross-site and **withhold the Strict cookie**.

The reason (2) is harmless in *this* app is architectural, and it was verified in the code rather than assumed:

- `GET /` on `app.moneydiary.cl` is served by Vercel from `index.html` (`apps/web/vercel.json` rewrite `"/(.*)" → "/index.html"`). It is a **static document that needs no cookie to render**.
- Auth state is established *after* the document loads, by `apps/web/src/routes/_authenticated.tsx` → `beforeLoad` → `requireSession(fetchMe, …)` → `fetchMe()` → `fetch('/api/auth/me', { credentials: 'same-origin' })` (`apps/web/src/api/auth.ts`).
- That `fetch` is a **same-site subresource request issued by an already-loaded same-origin document**. Its site-for-cookies is `app.moneydiary.cl`; there is no cross-site redirect chain. `SameSite=Strict` cookies are sent normally.

So the "logged-out screen that only works after refresh" failure mode requires a server-rendered page that reads the session during the landing navigation. MoneyDiary has no such page. The SPA's own bootstrap is the "same-site hop" the proposal was looking for — it already exists, for free.

### Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Same-site intermediate hop (`302 → /auth/continuar` which then client-navigates to `/`) | Solves nothing the SPA bootstrap does not already solve, and adds a route, a component, and a redirect the user can land on directly. Pure ceremony (KISS). |
| Interstitial "Signing you in…" page | Same as above plus a visible flash. |
| Flip `md_session` to `SameSite=Lax` | Weakens the CSRF posture of **every** endpoint for a problem that does not exist, and modifies `cookie.ts` — a file the password login and demo flow both depend on. Blast radius up, security down. |
| A second Lax cookie scoped to this flow | Two session cookies with different attributes is exactly the "two sources of identity" smell ADR-034 rejected in the Supabase alternative. |

### Residual risk and how it is retired

Cookie-storage semantics on a cross-site-initiated navigation cannot be proven by unit test — jsdom/supertest do not implement browser cookie policy. This is therefore a **mandatory manual verification gate before merging slice C2** (see §11.4): Chrome, Firefox and Safari, checking (a) `md_session` appears in DevTools → Application → Cookies after the callback, and (b) the dashboard renders authenticated **without a manual refresh**.

**Documented contingency, pre-approved, if a browser fails that gate:** scope `md_session` to `SameSite=Lax` *globally* (one-line change in `buildCookie`), not a per-flow variant. The security delta is acceptable and bounded: every state-changing endpoint is `POST`/`PATCH`/`DELETE` (Lax withholds cookies on cross-site unsafe methods), the one state-changing `GET` (`/api/auth/demo`) is already protected by the Sec-Fetch top-level guard, and cross-site *reads* of `GET` data endpoints are blocked by the CORS allowlist (`createCorsMiddleware`), which does not include any attacker origin. This contingency is written down here so it is a decision, not an improvisation under pressure.

---

## 3. D2 — Transient state/PKCE storage (proposal risks 2 and 5) and callback CSRF posture

**Decision: one short-lived HttpOnly cookie. No server-side store. No signing, no encryption.**

### Cookie definition

| Attribute | Value | Reason |
|---|---|---|
| Name | `md_oauth` | Distinct namespace from `md_session`; the existing hand-rolled parser matches on exact name. |
| Value | `base64url(JSON.stringify({ state, nonce, codeVerifier }))` | Explicit field names over short keys (KISS §7). ~280 bytes — far under the 4 KB limit. |
| `HttpOnly` | yes | JS never needs it; matches AUTH-01's "web JS never touches auth material". |
| `SameSite` | **`Lax`** | **Required.** `Strict` would not be sent on the cross-site callback navigation and every login would fail with a state mismatch. `Lax` is sent on top-level `GET` navigations, which is exactly and only what the callback is. |
| `Secure` | `cookieSecure` | Same value already derived once in `app.ts` (`env.NODE_ENV === 'production' \|\| env.COOKIE_SECURE`) and threaded through deps — reuse it, do not re-derive. |
| `Path` | `/api/auth/google` | Prefix-matches `/api/auth/google` and `/api/auth/google/callback` and nothing else. The browser sees these paths verbatim (the Vercel rewrite is server-side and transparent), so path scoping works end to end. |
| `Max-Age` | `600` (10 min) | Long enough for a real consent screen including a Google account switch; short enough that a leaked cookie is nearly worthless. |
| Domain | omitted (host-only) | Same posture as `md_session`. |

Cleared with `Max-Age=0` on the callback **before any other work**, on every outcome — success, state mismatch, token failure, no-match. A failed attempt must never leave a reusable `code_verifier` behind.

### Why a cookie and not a server-side store (risk 5)

A server-side store buys exactly one thing: genuinely single-use `state`. It costs either (a) an in-process `Map` — which is wrong on Render (a restart or a second instance silently breaks logins that are mid-flight), or (b) a new table + migration + a cleanup job, i.e. the same machinery `DemoCleanupService` exists for, to guard a 10-minute window.

The replay it would prevent is already prevented downstream: **Google's authorization `code` is single-use and expires in about a minute**. Replaying a captured `md_oauth` without a fresh, unused `code` gets you a token-endpoint rejection and a generic error redirect. The cookie is not the anti-replay control; the `code` is. YAGNI — with an explicit trigger to revisit: if we ever need to bind extra server-side state to a flow (e.g. a per-flow audit trail), the store becomes justified.

### Why no signing or encryption

Tempting, but it does not buy what it looks like it buys. An attacker who can *set* a cookie on `app.moneydiary.cl` (subdomain cookie-tossing from a sibling under `moneydiary.cl`) does not need to forge contents — they can obtain a perfectly valid, validly-signed `md_oauth` by calling initiate themselves, and then toss *that*. An HMAC signature is verified against a key that signs the attacker's own legitimate flow just as happily. So signing does not stop login-CSRF; it only stops forging arbitrary contents, which is not the attack.

What is actually protected: the contents are not secret from the legitimate user (they are that user's own `state`/`nonce`/`code_verifier`); `HttpOnly` blocks JS reads; `Secure` blocks network reads. Adding crypto here would be security theatre plus a key-management question, against KISS. Recorded as a conscious decision so a future reviewer does not read it as an oversight.

Note the residual, **pre-existing and unchanged** exposure: the hand-rolled cookie reader takes the first match by name, so a tossed `Domain=moneydiary.cl` cookie could shadow a host-only one. `md_session` already lives with this. Not introduced here, not fixed here; recorded in §13.

### CSRF posture of the two endpoints

- **Initiate** — `esNavegacionDeNivelSuperior(req)` reused **verbatim** (AUTH-11). Rejects `<img>`/`<iframe>` embedding with 403.
- **Callback** — the **same guard is applied**, which the proposal did not specify. The callback genuinely *is* a top-level document navigation when Google redirects (`Sec-Fetch-Dest: document`, `Sec-Fetch-Mode: navigate`), so the guard passes on the legitimate path and blocks forced-callback attempts embedded as sub-resources. It is free (one function call, already written and tested) and consistent. Its documented fail-open-when-both-headers-absent behaviour is inherited as-is.
- **Login-CSRF** (attacker completes their own flow in the victim's browser, silently logging the victim into the attacker's account) is mitigated by `state` bound to a cookie the victim's browser must itself have received, plus the top-level-navigation requirement on initiate. It is not fully eliminated against a subdomain-cookie-tossing attacker — same bound as every cookie-based OAuth implementation.

---

## 4. D3 — Ports, adapter, composition and activation (task item 4; proposal risk 4)

### 4.1 Two role interfaces, one adapter (ISP)

`application/ports/verificador-identidad-externa.port.ts` declares **two** interfaces in one file:

```ts
export interface InicioAutorizacion {
  readonly urlAutorizacion: string;
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

export interface IdentidadExterna {
  readonly sub: string;
  readonly email: string | null;
  readonly emailVerificado: boolean;
}

export interface ParametrosCallback {
  readonly urlCallback: string;   // absolute callback URL incl. query, rebuilt server-side
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
}

/** Consumido por la ruta de inicio. */
export interface IIniciadorLoginExterno {
  iniciar(): Promise<Result<InicioAutorizacion, VerificacionIdentidadFallidaError>>;
}

/** Consumido por LoginConGoogleUseCase (nombre fijado por ADR-034 §6). */
export interface IVerificadorIdentidadExterna {
  verificar(p: ParametrosCallback): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>>;
}
```

Rationale (SOLID/ISP): the use case never initiates, and the route never verifies. A single two-method port would force `LoginConGoogleUseCase`'s test double to stub a method it can never call — the exact smell the `solid` skill flags ("if the mock must stub 10 methods to exercise 2"). Two role interfaces in one file cost zero extra runtime, zero extra files, and both are satisfied by one adapter class. This is not speculative abstraction: both interfaces have a real consumer on day one.

Both return `Result` — the adapter **never** lets an `openid-client` exception cross the port (ADR-005 / repo convention: no throwing across application boundaries).

### 4.2 The adapter, and lazy discovery

`infrastructure/oidc/openid-client-google.adapter.ts` — `OpenIdClientGoogleAdapter implements IIniciadorLoginExterno, IVerificadorIdentidadExterna`. It is the only file in the repo that imports `openid-client`.

**Decision: OIDC discovery is lazy and memoised inside the adapter, not performed at boot.**

`createContainer` is synchronous and `openid-client` v6's `discovery()` is an async network call to Google's well-known document. Making the composition root async to accommodate it would ripple into `server.ts`, every test that builds a container, and the CLI. Worse, it would make **API boot depend on Google's availability** — a free-tier Render instance that cannot reach Google at cold start would fail to serve `/api/resumen`.

Instead: the adapter holds a memoised `Promise<Configuration>`; the first Google login pays ~100 ms of discovery, all subsequent ones pay nothing. **The memo caches the promise, and is cleared on rejection** so a transient DNS failure does not poison the adapter for the process lifetime. Discovery failure surfaces as `Result.fail` → the generic error redirect, with the rest of the app untouched.

Rejected: hardcoding Google's endpoint metadata (skips discovery entirely, but silently rots when Google rotates endpoints, and throws away the protocol correctness that motivated choosing `openid-client` in ADR-034).

`verificar()` calls `authorizationCodeGrant(config, new URL(p.urlCallback), { expectedState, expectedNonce, pkceCodeVerifier })` and maps the resulting claims to `IdentidadExterna` — `sub`, `email`, `email_verified`. Everything else, including `access_token`, is dropped on the floor and never returned past the port (AUTH-18).

### 4.3 Composition and the activation seam

`composition/crear-auth-google.ts`, mirroring `crear-auth.ts` — verified against the live file (`apps/api/src/composition/crear-auth.ts`), which builds `SystemReloj`, `Sha256SessionTokenService`, and `PrismaSessionRepository` **internally**, not as received parameters; `AuthGraph` does not expose them and `container.ts` holds no separate instances of them either. `crearAuthGoogle` follows the identical pattern (KISS: these are stateless, cheap-to-construct collaborators — no reason to thread them through the composition-root signature or to refactor `crear-auth.ts`/`AuthGraph` to expose shared instances):

```ts
export interface GoogleAuthGraph {
  readonly iniciador: IIniciadorLoginExterno;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleRateLimiter: IpRateLimiter;
}

export function crearAuthGoogle(
  prisma: PrismaClient,
  env: Pick<Env, 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_REDIRECT_URI'>,
  blindIndex: IBlindIndexService,
): GoogleAuthGraph | undefined
```

Internally, `crearAuthGoogle` constructs its own `reloj = new SystemReloj()`, `tokens = new Sha256SessionTokenService()`, and `sessions = new PrismaSessionRepository(prisma)` — the same three collaborators `crear-auth.ts` builds for itself, each a fresh, independent instance (they are stateless wrappers over `prisma`, so a second instance carries no risk of drift or double-state). `blindIndex` is the one collaborator still received as a parameter, because — per §5.5 — it must be the **same instance** `container.ts` already derived once from `env.ENCRYPTION_KEY`; a second HKDF derivation would produce a different blind index and silently break every email-based link lookup.

Returns `undefined` when `env.GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are absent. `Container` gains `readonly googleAuth?: GoogleAuthGraph`. The *type system* now carries the feature's on/off state — there is no boolean flag anywhere.

No changes to `crear-auth.ts`, `AuthGraph`, or `container.ts`'s existing `crearAuth(...)` call are required by this decision — the §1 layer map already lists `crear-auth-google.ts` as the only new composition artifact, and that stays accurate.

### 4.4 Routes not mounted ≠ 404 — a real trap, and the fix

**Discovery that changes the design.** The proposal assumed "register the routes only when the container has the adapter → 404 when unconfigured". **That is false in this app.** In `app.ts`:

```ts
const protectedApi = express.Router();
protectedApi.use(sessionMiddleware(container.validarSesion));
…
app.use('/api', protectedApi);
```

`router.use(mw)` with no path runs for **every** request that reaches the router, matched route or not. An unmounted `/api/auth/google` therefore falls through the session-public router into `protectedApi`, hits `sessionMiddleware`, finds no token and returns **401**, not 404. AUTH-16 would fail its own acceptance scenario.

**Decision: mount a disabled stub when the feature is off.** `app.ts` gets exactly one branch, at the composition seam:

```ts
if (container.googleAuth !== undefined) {
  registrarAuthGoogle(authPublicApi, { ...container.googleAuth, cookieSecure, redirectUri: env.GOOGLE_REDIRECT_URI });
} else {
  registrarAuthGoogleDeshabilitado(authPublicApi);   // both paths → 404
}
```

This keeps the proposal's intent ("activation is structural, not conditional logic") — the decision is made once, in composition, and no handler contains an `if (featureEnabled)` — while actually delivering the 404 the spec requires. The stub is ~8 lines and directly unit-testable.

Rejected: always mounting the real routes with a guard clause at the top of each handler (puts the flag inside the hot path, and the two handlers would each need it); a `/api/auth/google*` 404 catch-all (works, but is a second, invisible routing rule competing with the real one).

### 4.5 Capability discovery (proposal risk 4)

**Decision: a new `GET /api/auth/capabilities`, session-public, always mounted, returning `{ "googleLoginEnabled": boolean }` sourced from `container.googleAuth !== undefined`.**

Spec coverage: **AC-10** (`specs/api-access-control/spec.md`) pins this contract — session-public + api-key required (same marker as `login`/`demo`/`AC-09`), always mounted regardless of activation state, exact response shape, and both activation states (`true`/`false`).

| Option | Verdict |
|---|---|
| Build-time `VITE_GOOGLE_LOGIN_ENABLED` / `EXPO_PUBLIC_*` | **Rejected.** Duplicates a server-owned truth into a client bundle. The kill switch is "unset the env vars in Render" — a build-time flag would keep showing a button that now 404s, and fixing it would require a redeploy of the web. Directly contradicts locked answer Q4. |
| Extend `GET /version` | **Rejected.** `/version` is ADR-030's build-identity contract (`{version, commit, ref, builtAt}`), consumed by the web badge and used operationally to answer "what is deployed". Feature capabilities are a different concern with a different lifecycle (SRP). |
| New `GET /api/auth/capabilities` | **Chosen.** One tiny always-on route, no drift, same answer for web and mobile, api-key-protected like the rest of `/api` (web reaches it through the proxy; mobile sends the key). |

Cost: one round trip on `/login`. The button renders only once the answer arrives (no flash of a dead button, no layout jump — reserve the space). Acceptable, and honest about where the truth lives.

---

## 5. D4 — Identity resolution: placement, port, and the ADR-013 pipeline (task item 5; proposal risk 8)

### 5.1 Placement: inside `LoginConGoogleUseCase`

**Decision: lookup *and* first-time linking live in `LoginConGoogleUseCase`. No `VincularIdentidadGoogleUseCase`, no domain service.**

- Linking is not independently invocable — locked answer Q6 removed link-management UI entirely, so a standalone use case would have exactly one caller, forever (YAGNI: "no plugin systems with a single plugin").
- The rule is a *policy* about which stored user an external identity maps to. It needs a repository, so it cannot live in `domain/` without dragging I/O in. Application is its correct home.
- One use case = one authentication decision = one place to read when auditing this hot path.

The use case does **not** open an explicit transaction. Two sequential writes (link, then create session) with no invariant spanning them: if the link succeeds and the session insert fails, the user is linked but not logged in — they retry and log in immediately via the `googleSub` path. That is a benign, self-healing state, and adding a transaction would mean threading a Prisma transaction client through an application-layer port, breaking the abstraction for no gain (KISS).

### 5.2 A new role port, not an extension of `IUserCredentialRepository`

**Decision: new `application/ports/identidad-google-repository.port.ts`; `IUserCredentialRepository` is not touched.**

The proposal suggested extending the existing credentials port. Reading it changed the call:

```ts
async buscarPorEmail(email: Email): Promise<CredencialUsuario | null> {
  …
  if (user === null || user.passwordHash === null) return null;   // ← wrong semantics for Google
```

`IUserCredentialRepository.buscarPorEmail` deliberately returns `null` for a user *without a password*, because for password login "no password" means "cannot log in". For Google linking, a user without a password is a perfectly valid link target. Reusing it would either return the wrong answer or require changing a method the password login depends on — modifying a security-critical path this change promised not to touch.

```ts
export interface UsuarioVinculable {
  readonly userId: string;
  readonly esDemo: boolean;
  readonly googleSub: string | null;
}

export interface IIdentidadGoogleRepository {
  buscarPorGoogleSub(googleSub: string): Promise<UsuarioVinculable | null>;
  buscarPorEmail(email: Email): Promise<UsuarioVinculable | null>;
  /** true si el link se aplicó; false si la fila ya tenía otro googleSub o hubo colisión de unicidad. */
  vincularGoogleSub(userId: string, googleSub: string): Promise<boolean>;
}
```

Three methods, one role, small mocks (ISP). `esDemo` is returned rather than filtered in SQL so the **business rule stays in application** — the repository reports facts, the use case decides. Fail-closed either way.

### 5.3 The algorithm (AUTH-14), including the case the spec does not name

```
1. Email.crear(identidad.email) only when needed (normalises trim+lowercase).
2. u = buscarPorGoogleSub(sub)
     → found and !u.esDemo  ⇒ issue session
     → found and  u.esDemo  ⇒ fail(motivo: 'usuario-demo')
3. !identidad.emailVerificado ⇒ fail(motivo: 'email-no-verificado')   [no lookup at all]
4. u = buscarPorEmail(email)
     → null                       ⇒ fail(motivo: 'sin-match')
     → u.esDemo                   ⇒ fail(motivo: 'usuario-demo')
     → u.googleSub !== null       ⇒ fail(motivo: 'ya-vinculado-a-otra-identidad')   ★
     → else vincularGoogleSub()   → false ⇒ fail(motivo: 'link-perdio-la-carrera')
                                  → true  ⇒ issue session
5. Session issuance is byte-identical to LoginUseCase:
     const { token, tokenHash } = tokens.generar();
     const expiresAt = calcularExpiracion(reloj.ahora());
     await sessions.crear({ userId, tokenHash, expiresAt });
```

★ **Not in the spec, added by design.** Step 2 already failed, so `u.googleSub` being non-null means it holds a *different* `sub` — a second Google account whose verified email matches an already-linked MoneyDiary account. Blindly writing would **silently re-link the account to a different Google identity**, which is an account-takeover primitive if an attacker can get a Google account verified on the victim's email address. Refusing is one `WHERE googleSub IS NULL` and costs nothing. Fails with the same generic error, so it leaks nothing.

### 5.4 Concurrency

`vincularGoogleSub` is a conditional update, not a read-modify-write:

```ts
const { count } = await prisma.user.updateMany({
  where: { id: userId, googleSub: null },
  data: { googleSub },
});
return count === 1;
```

Races and their outcomes:

- **Same identity, two concurrent first logins.** Both target the same row with the same value. One wins (`count === 1`), the loser gets `count === 0` and a generic error; the retry resolves via `buscarPorGoogleSub`. No corruption.
- **`googleSub` grabbed by another row between step 2's read and step 4's write** (TOCTOU on the `@unique` index). Prisma raises `P2002`. The repository **catches `P2002` and returns `false`** — this is a business outcome, not an infrastructure fault, so it must not throw across the port (repo convention). Any other Prisma error propagates and is handled by `errorMiddleware`.

### 5.5 The email through ADR-013

Cleartext never touches the database. The use case builds the `Email` VO (`trim + lowercase`, the same normalisation the password path uses so the blind index matches); the Prisma adapter computes `blindIndex.compute(email.valor)` and queries `where: { emailBlindIndex }` — identical to `PrismaUserCredentialRepository.buscarPorEmail`, same `HmacBlindIndexService` instance, same HKDF-derived key from `container.ts`. Reusing the *same instance* is essential: a differently-derived key produces a different index and every link silently misses.

No AES-GCM encryption happens on this path at all, because **this flow never writes an email** (login-only, no creation). If `Email.crear` fails on a malformed Google email, it is a generic failure — never an `EmailInvalidoError` at the boundary (that error carries the raw input; AUTH-18 forbids it near logs).

`googleSub` is stored in cleartext and unencrypted: an opaque IdP identifier, not readable PII, and it must be `@unique`, which non-deterministic encryption forbids. Consistent with ADR-013's own reasoning for blind indexes.

### 5.6 Timing analysis (AUTH-15 requires no timing signature)

Query counts, corrected against §5.3's actual algorithm (step 2's `buscarPorGoogleSub` always runs first, before the `email_verified` check or step 4):

| Branch (§5.3 label) | Query count | Additional work |
|---|---|---|
| found by `sub`, not demo → **success** | 1 (`buscarPorGoogleSub`) | + session `INSERT` |
| found by `sub`, demo → reject | 1 (`buscarPorGoogleSub`) | none |
| not found by `sub`, `email_verified: false` → reject | 1 (`buscarPorGoogleSub`) | none — `buscarPorEmail` never runs |
| not found by `sub`, verified, `email` null or malformed (`Email.crear` fails) → reject | 1 (`buscarPorGoogleSub`) | none — `buscarPorEmail` never runs |
| not found by `sub`, verified, no match (`sin-match`) → reject | 2 (`buscarPorGoogleSub` + `buscarPorEmail`) | none |
| not found by `sub`, verified, match is demo → reject | 2 | none |
| not found by `sub`, verified, match already linked to another `sub` (★) → reject | 2 | none |
| not found by `sub`, verified, `vincularGoogleSub` loses the race → reject | 2 | + failed `UPDATE` attempt |
| not found by `sub`, verified, links → **success** | 2 | + `UPDATE` (link) + session `INSERT` |

Unlike `LoginUseCase`, **no dummy work is needed**, but the argument is scoped correctly this time — two corrections to the earlier draft: the unverified-email branch costs 1 query (not zero, because `buscarPorGoogleSub` already ran), and the no-match/demo-via-email/already-linked rejects cost 2 queries (not 1, because both lookups run before failing).

- The enumeration oracle AUTH-02 guards against is "does this email have a MoneyDiary account". An attacker probing an **arbitrary target email** cannot reach the `sub`-based branches for that email unless they already hold a Google account whose `sub` is linked to the target — which means they already know the account exists and is linked, so no new information leaks from that path being cheaper. The realistic oracle path is always the *not-found-by-`sub`, verified* set: no-match vs. demo-match vs. already-linked. **All three cost exactly 2 indexed queries before diverging — genuinely structurally identical**, not merely asserted.
- The `email_verified: false` branch does cost fewer queries (1) than the verified-and-checked branches (2), but it leaks only the `email_verified` flag of the **attacker's own Google account**, which the attacker already knows. Not an oracle about MoneyDiary — the earlier "zero queries" framing was wrong about the mechanism, but the underlying "not an oracle" conclusion still holds.
- Same reasoning applies to the `email === null` / malformed-email branch: it also costs 1 query and diverges before `buscarPorEmail` ever runs. What it leaks is a property of the **presenter's own Google identity** (that the `email` claim was absent or failed `Email.crear`'s validation) — never an oracle about whether any MoneyDiary account exists, because no MoneyDiary lookup happened yet.
- Success costs the same 2 reads as the other verified branches, plus a write (`UPDATE` and/or session `INSERT`), but success is already observable by other means — you end up logged in — so the extra write does not leak new information.

**Decision: argue the quantified, scoped bound above (option b) rather than add symmetric dummy work (option a).** A no-op lookup added to the `sub`-found and unverified-email branches to force every branch to 2 queries would paper over a distinction shown above to be non-exploitable, and would add meaningless work to a hot path — against this design's own KISS stance (§3, §5.1). Recorded here so a reviewer does not "fix" this by adding dummy work, and so `sdd-verify` checks the counts in this table against §5.3 rather than trusting the earlier draft.

---

## 6. D5 — Errors, redirects, logging, rate limiting (task item 6; proposal risk 7)

### 6.1 One domain error, one redirect

`domain/errors/login-con-google-fallido.error.ts` — a **single** error class (the proposal floated two; one is enough and structurally guarantees AUTH-15):

```ts
export type MotivoFalloGoogle =
  | 'sin-match' | 'email-no-verificado' | 'usuario-demo'
  | 'ya-vinculado-a-otra-identidad' | 'link-perdio-la-carrera' | 'email-invalido';

export class LoginConGoogleFallidoError extends Error {
  constructor(readonly motivo: MotivoFalloGoogle) {
    super('No pudimos iniciar sesión con Google.');   // fixed, never derived from motivo
  }
}
```

`message` is constant across every branch; `motivo` exists **only** for server-side logging and can never reach the client, because the route's failure path is a fixed redirect with no body:

```
302  Location: /login?error=google
```

One literal value, `google`. Not an error code, not a taxonomy, not derived from `motivo` — AUTH-15 forbids any distinguishable value. Consent-denied (`?error=access_denied` from Google), state mismatch, token failure, no-match: all identical.

`VerificacionIdentidadFallidaError` (infrastructure/port level, for OIDC exchange failures) maps to the same redirect. Two error types because they belong to two layers; one observable outcome.

### 6.2 Web-side rendering of `?error=`

`apps/web/src/routes/login.tsx` currently declares `validateSearch` returning only `{ redirect?: string }`, so **TanStack Router strips `?error=` today** — it must be extended, and it must **whitelist**, never echo:

```ts
validateSearch: (search): { redirect?: string; error?: 'google' } => {
  const sanitized = sanitizeRedirect(search.redirect);
  return {
    ...(sanitized === '/' ? {} : { redirect: sanitized }),
    ...(search.error === 'google' ? { error: 'google' as const } : {}),
  };
}
```

Same discipline as `sanitizeRedirect`: the param is attacker-controlled from the URL bar, so only a known literal survives. `LoginForm` (or `LoginPage`) renders the existing `role="alert"` style with a fixed Spanish string.

### 6.3 Logging (ADR-033 / AUTH-18) — including two leaks found in the current code

Handler logging follows the existing auth handlers verbatim: `appLogger.warn('…', { path: req.path })`, plus `motivo` on failures (safe: a fixed enum, no user data). Never `state`, `code`, `id_token`, `code_verifier`, email, or `googleSub`.

Reading the logging stack surfaced two problems that this flow would make materially worse, and both are cheap to close:

**(a) `req.url` is logged with its query string.** `createRequestLoggerMiddleware` uses `pino-http` with its default `req` serializer, which emits `url` — the full path **including the query**. For the callback that means `?code=4/0A…&state=…` lands in Render's logs, directly violating AUTH-18. `SENSITIVE_REDACT_PATHS` cannot catch it: the sensitive values are inside a single `url` string, not addressable keys.

*Fix (slice C1):* a pure, unit-tested helper `redactarQueryParamsSensibles(url: string): string` that replaces the value of any of `code`, `state`, `id_token`, `access_token`, `refresh_token`, `token`, `code_verifier` with `[REDACTED]`, wired as `serializers.req` in `createRequestLoggerMiddleware`. Generic (protects future endpoints), ~20 lines, no behaviour change for `?periodo=`/`?anio=`.

**(b) Response headers may be logged, including `Set-Cookie`.** `pino-http`'s default `res` serializer emits `statusCode` **and `headers`**, and `SENSITIVE_REDACT_PATHS` covers `req.headers.cookie` but **not** `res.headers["set-cookie"]`. If confirmed at apply time, every `POST /api/auth/login`, `GET /api/auth/demo` and now the Google callback writes a **live session token** to production logs.

*Fix (slice C1):* add `'res.headers["set-cookie"]'` to `SENSITIVE_REDACT_PATHS` and add a regression test that captures the NDJSON stream for a login response and asserts the token value does not appear. **This is a pre-existing exposure, not one this change introduces** — flagged in §13 as possibly deserving its own immediate fix PR ahead of this chain.

### 6.4 Rate limiting — both endpoints, one limiter (proposal risk 7)

**Decision: rate-limit initiate *and* callback, against a single shared per-IP counter.**

The proposal leaned toward "callback rate limiting is YAGNI because `state` validation rejects forgeries cheaply". That is right about *forgeries* and wrong about *amplification*: an attacker who performs one legitimate initiate holds a valid `md_oauth`, and can then replay the callback with that valid `state` and a junk `code` as often as they like. Each replay passes the cheap check and reaches `authorizationCodeGrant`, i.e. **an outbound HTTPS request to Google per attacker request** — a free amplifier against our own egress and Google quota.

Sharing one counter between the two endpoints closes it without any new machinery: the attacker's replays consume the same budget as their initiates.

Implementation — `DemoRateLimiter` is renamed to **`IpRateLimiter`** (`infrastructure/http/auth/ip-rate-limiter.ts`) with an explicit key-prefix constructor parameter. This is a mechanical rename of an existing, fully tested class whose logic is *already exactly* what is needed (per-IP counter, fixed window, lazy purge, hard entry cap). Two instances are then built in composition:

| Instance | Prefix | Budget | Where |
|---|---|---|---|
| demo | `demo:ip:` | 3 / hour (unchanged) | `crearAuth` |
| google | `google:ip:` | **10 / 15 min** | `crearAuthGoogle` |

Hardcoded constants, no new env vars — same reasoning the existing `DemoRateLimiter` documents ("a product value, not a threshold an operator must be able to tweak"). 10/15 min tolerates a genuine retry loop (wrong Google account, back button, expired flow) while capping amplification hard. Known caveat, inherited from the existing limiters: a shared NAT/corporate egress IP shares the budget.

Rejected: copy-pasting a near-identical `GoogleAuthRateLimiter` (100 lines duplicated in security code — DRY violation where it hurts most); a second `DemoRateLimiter` instance (works, since counters are per-instance, but the name would lie).

---

## 7. D6 — Web proxy verification (task item 7; proposal risk 6)

Verified against `apps/web/api/proxy.ts` and `apps/web/vercel.json`, not assumed. **No proxy changes are required.**

| Requirement of the flow | Evidence in the proxy | Verdict |
|---|---|---|
| Nested path `/api/auth/google/callback` routes correctly | `vercel.json` rewrite `"/api/(.*)" → "/api/proxy?upstream=$1"`; the single-function design exists precisely because the catch-all only routed one segment deep | ✅ |
| Query params (`code`, `state`) survive | `resolveUpstreamPath` deletes only `upstream` and re-appends `parsed.searchParams.toString()` | ✅ |
| Sec-Fetch reaches the guard | `x-fwd-sec-fetch-dest`/`-mode` set server-side from the incoming request; `forwardableHeaders` strips any client-supplied value (unforgeable). `esNavegacionDeNivelSuperior` reads `x-fwd-*` first | ✅ |
| `Cookie` request header (carrying `md_oauth`) forwarded | `NON_FORWARDABLE` = `{host, connection, x-api-key, x-fwd-sec-fetch-*}` — `cookie` is not excluded | ✅ |
| 302 with an **off-origin** `Location: https://accounts.google.com/...` passes through | `http(s).request` is used *specifically because* it never follows redirects (documented in the file after the demo fix). `Location` is copied verbatim; only hop-by-hop response headers are skipped | ✅ |
| `Set-Cookie` relayed on that same 302 | The response-header loop forwards every non-hop-by-hop header, arrays included — this is exactly the demo's `302 + Set-Cookie: md_session` path already working in prod | ✅ |
| `redirect_uri` must be the app origin | `https://app.moneydiary.cl/api/auth/google/callback`, registered in Google Console. Traversing the proxy is what keeps `md_session` host-only for the app domain (ADR-034 §2) | ✅ by config |

One nuance worth stating: `redirect_uri` is **configured, never derived from request headers**. The proxy forwards `x-forwarded-host`, and deriving the redirect target from a forwardable header in an auth flow is an open-redirect footgun. It comes from `env.GOOGLE_REDIRECT_URI` (§8).

Dev parity: the Vite dev proxy forwards standard `sec-fetch-*` verbatim (the guard falls back to them) and does not follow redirects. `GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback`, also registered in Google Console (Google permits `http://localhost`). `COOKIE_SECURE=false` locally, as today.

---

## 8. D7 — Env and configuration (ADR-029)

Three new keys in `EnvObjectSchema`, all `.optional()`, all `.describe(...)` so `pnpm api env:example` regenerates `.env.example` (checked in CI):

| Key | Rule |
|---|---|
| `GOOGLE_CLIENT_ID` | optional string |
| `GOOGLE_CLIENT_SECRET` | optional string |
| `GOOGLE_REDIRECT_URI` | optional absolute URL; `https` required when `NODE_ENV === 'production'` |

`refineByEnvironment` gains one rule: **all-or-nothing.** If exactly one of `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` is present → boot fails (a half-configured OAuth client is a misconfiguration, never a silent disable). If both are present and `GOOGLE_REDIRECT_URI` is absent → in `production`, boot fails; in `development`/`test`, it defaults to `http://localhost:5173/api/auth/google/callback` so local work stays zero-config, mirroring how `COOKIE_SECURE` and the localhost DB rule are already env-conditional.

**Boot-time pathname assertion (closes the misconfigured-`redirect_uri` gap).** `GOOGLE_REDIRECT_URI` well-formedness (absolute URL, `https` in production) does not catch every failure mode: a syntactically valid URL whose **pathname** does not match where the callback route is actually mounted (`/api/auth/google/callback`) would boot fine, then fail every real login. `refineByEnvironment` therefore adds one more check, evaluated only when Google is active: `new URL(GOOGLE_REDIRECT_URI).pathname === '/api/auth/google/callback'`. A mismatch fails boot with a explicit message naming both the configured pathname and the expected one — this is a same-process, same-deploy check (no network call to Google), so it is cheap and belongs at boot alongside the other `refineByEnvironment` rules.

**What this assertion does *not* catch, and why that is an accepted exception to the uniform-failure claim.** The assertion proves the URL is internally consistent with our own routing; it cannot prove the value is the one **registered in Google Cloud Console** for this OAuth client. If those two diverge, Google's own consent flow returns its `redirect_uri_mismatch` error page — the request never reaches `/api/auth/google/callback` at all, so the user sees Google's UI, not MoneyDiary's `/login?error=google`. This is explicitly scoped **out** of AUTH-15's uniform-failure guarantee: AUTH-15 governs outcomes our server produces once a request reaches it; a Console-registration mismatch is a **deploy/config failure mode**, not something a user or attacker can trigger by manipulating a request (it requires control over the Google Console project itself, which is an operator-only surface, not a client-observable oracle). It is caught operationally, not at runtime — see the manual checklist addition in §11.4.

**Compatibility note for `sdd-verify`:** AUTH-16 names two variables as the activation gate. That gate is unchanged — activation is `GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET`. `GOOGLE_REDIRECT_URI` is a *well-formedness* rule of the enabled configuration (fail-fast at boot), never a third switch, so the AUTH-16 scenarios hold literally: with both credentials set and a valid config, the endpoints are live; with neither, both 404.

Kill switch is unchanged and still code-free: unset the two credentials in Render → next restart, `crearAuthGoogle` returns `undefined` → stub routes 404 → `/api/auth/capabilities` reports `false` → the button disappears from `/login` with no web deploy.

---

## 9. D8 — Mobile: M1 vs M2, and the ADR call (task item 2; proposal risks 3 and 9)

### 9.1 Decision: **M1 (native token exchange)** — and mobile ships as its **own SDD change**

Scope is not reduced. Locked answer Q1 (web + mobile) stands and MOB-05 stands. What changes is **delivery**: mobile leaves this change's PR chain and becomes `auth-google-login-mobile`, carrying the `mobile-session-auth` spec delta with it.

### 9.2 Why M2 loses

M2 needs the **system browser** to reach our API, but `app.use('/api', createApiKeyMiddleware(env.API_KEY))` guards all of `/api` and the system browser cannot send `x-api-key`. The only ways out are all bad:

1. **Exempt `/api/auth/google*` from the api-key.** Punches a hole in a fail-closed control that api-access-control depends on, to serve one client. Rejected on security grounds.
2. **Mount browser-facing Google routes at the root, outside `/api`** (like `/version`). This breaks the web: the Vercel proxy only rewrites `/api/*`, so the web would navigate cross-origin to `api.moneydiary.cl/auth/google` and the callback would set the host-only `md_session` on the **API** host — the browser would never send it to `app.moneydiary.cl`. That is precisely what ADR-034 §2 designed the app-origin `redirect_uri` to avoid.
3. **Two OIDC termination surfaces**, one api-keyed for web and one exempt for mobile. Doubles the attack surface of the single most sensitive endpoint pair in the codebase and destroys M2's only real advantage ("one termination point").

M2 also needs a deep-link scheme, EAS config, and a **new one-time-code store** — the exact server-side state §3 rejected on Render.

### 9.3 What M1 costs, stated honestly

`expo-auth-session` runs PKCE against Google with native (iOS/Android) client IDs — public clients, no secret on device — and obtains an `id_token`. The app then `POST`s it to a new `POST /api/auth/google/token` **with `x-api-key`**, which verifies it and returns `{ token, userId, expiresAt }` — the same body `POST /api/auth/login` already returns and `apps/mobile/src/api/client.ts` already parses (`LoginResponseDto`), persisted to SecureStore and flipping the gate via `signIn(token)` exactly as password login does. MOB-05 is satisfied verbatim.

Real costs, to be designed in the follow-up change:

- **A second trust boundary.** The `id_token` is client-supplied. `aud` must be validated against the mobile client IDs (a new `GOOGLE_CLIENT_ID_IOS`/`_ANDROID`), plus `iss`, `exp`, and signature against Google's JWKS.
- **No server-issued `nonce`.** The server did not initiate the flow, so it cannot bind a nonce. Replay of a captured `id_token` is bounded only by `exp` (~1 h). This is the standard "authenticate with a backend server" posture Google documents, but it is strictly weaker than the web flow's nonce binding and must be written down, not glossed over. (A stronger variant — the app sends the authorization **code** and the server exchanges it, shrinking the replay window to the code's ~60 s single use — should be evaluated as the first alternative in that change's design.)
- New env vars, new Google Console client IDs, a third entry point into identity resolution.

The mitigating structural fact: **`LoginConGoogleUseCase` and `IIdentidadGoogleRepository` are reused unchanged.** Only a second implementation of `IVerificadorIdentidadExterna` (a JWKS-based `id_token` verifier) is added. The find-only policy, demo exclusion, `email_verified` gate and the ★ re-link refusal are shared by construction, not by convention.

### 9.4 Why it is a separate change, not slice D

1. It introduces a **different trust model** (client-supplied token) that deserves its own adversarial review, not a fifth review pass at the end of a 1,500-line auth chain.
2. It adds **new externally-reachable API surface** — the proposal itself flagged that as the trigger for splitting ("Slice D may reasonably become its own change if the chosen option requires new API surface (M1's token-exchange endpoint)"). That condition is now met.
3. It is not blocked by, and does not block, the web feature. Sequential delivery loses nothing.
4. It needs external setup (iOS/Android OAuth clients, an EAS build to test on device) that cannot be verified in CI and would stall the web chain.

### 9.5 ADR recommendation: **amend ADR-034 for scope + write ADR-035 for the mobile mechanism**

- **Amend ADR-034** (§7 and Consequences), one paragraph: the UI section is web-specific; mobile is in scope and its mechanism is decided in ADR-035. Also record this design's cross-cutting resolutions (lazy discovery, transient-cookie shape) as implementation detail — no change to the decision itself.
- **Write ADR-035 — "Login con Google en mobile (verificación de `id_token` nativo)".** ADR-034's core decision is literally *"flujo OIDC Authorization Code + PKCE que **termina en `apps/api`**"*. M1 terminates the OIDC flow **on the device**; the server becomes a token verifier. That is a material deviation from the decided architecture with its own alternatives (M2, GIS, Firebase Auth) and its own consequences (nonce gap, extra client IDs). Folding it into an amendment would hide a real architectural decision inside an edit. It ships with the `auth-google-login-mobile` change.

This is the design's recommendation; §13 flags it for the user's confirmation.

---

## 10. D9 — OpenAPI contract (ADR-011)

`openapi.json` is generated from a **hand-registered, fixed-order path map** in `schemas/openapi-document.ts` — it is not derived from the Express router, so new routes are invisible unless added there. `openapi:check` would still pass if we skipped it, which makes silent omission easy.

**Decision: register all three endpoints, appended at the end of `paths` (never reordering existing entries — that ordering is part of the determinism contract).**

- `/api/auth/google` `get` — contract-only, no response body, modelled on `authDemoOperation`: `302` (+ `Location` header), `403` (Sec-Fetch guard), `404` (feature inactive), `429`.
- `/api/auth/google/callback` `get` — `302` for **both** success and failure (documenting that the two are indistinguishable is itself the AUTH-15 contract), `403`, `404`, `429`.
- `/api/auth/capabilities` `get` — `200` with a real Zod schema (`auth-capabilities.schema.ts` + its sync spec, following the existing per-schema pattern).

Side effect to expect: the advisory DAST job (Schemathesis, GET-only, `continue-on-error`) will start probing these paths. It will get `403`/`404`/`302` — no false gate, since DAST never blocks.

---

## 11. Testing strategy (task item 8; proposal risk 10)

Strict TDD is active: tests first, `pnpm api test` / `pnpm web test`.

### 11.1 Correction to the proposal's assumption

Proposal risk 10 says integration/e2e "still must be provisioned locally and are **not in CI**". **That is out of date.** `.github/workflows/ci.yml` runs an `integration` job with a `postgres:16-alpine` service container, `ALLOW_DESTRUCTIVE_DB=1`, `pnpm api test:db:setup`, then `pnpm api test:integration` **and** `pnpm api test:e2e` against a localhost DB the db-safety gate accepts. DB-backed tests are a real, blocking pre-merge gate. Plan accordingly.

### 11.2 Unit — `pnpm api test`, no database

The important structural fact: **`createApp(container, env)` takes an injected `Container`**, and its own docstring says it must stay exercisable with a minimal container double. So most of what the proposal assigned to "integration" is provable with supertest and a fake container, no DB:

- `LoginConGoogleUseCase` with port doubles — existing `googleSub` → session; first-time link with `emailVerificado: true` → link + session; `emailVerificado: false` → generic failure, **no lookup performed** (assert the repo double was not called), no link; unknown identity → generic failure, **no user created**; demo on both the `sub` path and the email path → rejected; **already linked to a different `sub` → rejected, no overwrite** (★ §5.3); `vincularGoogleSub` returns `false` → generic failure; every failure carries the identical `message`.
- `oauth-transient-cookie.ts` — serialisation, exact attribute string (`SameSite=Lax`, `HttpOnly`, `Path`, `Max-Age`, `Secure` on/off), round-trip parse, malformed/absent/truncated payloads → `undefined`, clear header shape. Pure functions, same style as `cookie.ts` / `extraer-token.ts`.
- `env.ts` — both credentials → enabled; neither → disabled; exactly one → **boot fails**; both + missing redirect URI in production → boot fails; both + missing redirect URI in development → default applied; `.env.example` regeneration check.
- `redactarQueryParamsSensibles` — `code`/`state`/`id_token`/… redacted, `periodo`/`anio` untouched, no-query and malformed URLs safe.
- `OpenIdClientGoogleAdapter` with a stubbed discovery/`Configuration` — maps claims to `IdentidadExterna`; **never throws** across the port; discovery failure → `Result.fail`; memo cleared on rejection so the next call retries.
- HTTP surface via **supertest + fake container**: 404 on both paths when `googleAuth` is undefined (AUTH-16); `403` on non-top-level initiate; `302` to Google + `Set-Cookie: md_oauth` on a valid initiate; `429` after the budget; callback with missing/mismatched `state` → `302 /login?error=google` **and the verifier double is never called**; callback happy path with a fake verifier → `Set-Cookie: md_session` (attributes equal to the login cookie) + `302 /`; `md_oauth` cleared on every outcome; `/api/auth/capabilities` reports both states.
- Logging regression: capture the pino stream and assert no `code`/`state`/`md_session` value appears (covers §6.3 (a) and (b)).
- `openapi:check` and the schema sync spec.

### 11.3 Integration — `pnpm api test:integration` (real Postgres, in CI)

Only what genuinely touches the database:

- `PrismaIdentidadGoogleRepository`: find by `googleSub`; find by `emailBlindIndex` (proving the blind index derived here matches the one the seeded/login path writes); `vincularGoogleSub` writes once and returns `true`; second call on an already-linked row returns `false` and does **not** overwrite; a `P2002` collision returns `false` rather than throwing; demo rows are surfaced with `esDemo: true`.
- One end-to-end callback with a **verifier double** (never live Google, per ADR-034's consequences) asserting a real `Session` row with a SHA-256 hash and `expiresAt` at creation + 7 days, indistinguishable from a password-login row (AUTH-13).
- The additive migration applies cleanly and existing rows get `NULL`.

### 11.4 Not provable pre-merge — manual verification plan

The real conversation with Google (discovery, consent, a genuine signed `id_token`) and browser cookie policy cannot be automated here. Before merging **slice C2**, run this checklist with a real Google Cloud Console project (test client, redirect URIs registered for localhost and prod), and paste the result into the PR:

1. Local: click "Continuar con Google" → consent → land on the dashboard **authenticated without a manual refresh** (this is the D1 gate).
2. Repeat in **Chrome, Firefox and Safari**. Confirm in DevTools → Application → Cookies that `md_session` is present with `HttpOnly` + `SameSite=Strict` (+ `Secure` in prod).
3. Cancel at the consent screen → lands on `/login` with the generic alert, no session.
4. Sign in with a Google account that matches no MoneyDiary user → same generic alert, and confirm in the DB that **no user row was created**.
5. Tamper: hand-edit `state` in the callback URL → generic alert, no session, and confirm the logs show the failure **without** `code`/`state` values.
6. Unset the two env vars → restart → both endpoints 404 and the button disappears (kill-switch drill).
7. Repeat 1–3 against prod after deploy, through `app.moneydiary.cl`.
8. **Before merging slice C2** (per environment — local, prod): verify the `redirect_uri` registered in Google Cloud Console for this OAuth client matches `GOOGLE_REDIRECT_URI` exactly (scheme, host, port, pathname). A mismatch here bypasses the app entirely and surfaces Google's own `redirect_uri_mismatch` page instead of `/login?error=google` (§8's accepted exception to the uniform-failure claim) — the boot-time pathname assertion (§8) cannot catch it because it has no visibility into Console registration.

If step 1 or 2 fails in any browser, apply the pre-approved §2 contingency (global `SameSite=Lax`) rather than improvising.

---

## 12. Delivery slices (task item 9)

The proposal's A/B/C/D is **adjusted**: mobile leaves the chain (§9.4), and B is too large for the 400-line budget on an auth hot path. Five slices, chained.

| # | Slice | Content | ~Lines | Independently shippable |
|---|---|---|---|---|
| **A** | Application core | `googleSub` migration; `LoginConGoogleFallidoError`; both port files; `LoginConGoogleUseCase`; unit tests with doubles | ~400 | Yes — inert, nothing constructs it |
| **B** | Adapters + env | `openid-client` dep; `OpenIdClientGoogleAdapter` + unit tests; `PrismaIdentidadGoogleRepository` + integration tests; env trio + `.env.example` | ~450 | Yes — no HTTP surface |
| **C1** | Activation seam | `IpRateLimiter` rename; `crearAuthGoogle` + `container.googleAuth?`; `registrarAuthGoogleDeshabilitado` (404); `GET /api/auth/capabilities` + schema; log-redaction hardening (§6.3 a+b); `app.ts` branch; supertest specs | ~300 | Yes — ships AUTH-16's 404 and the capability contract with zero Google traffic |
| **C2** | The real endpoints | `oauth-transient-cookie.ts` + specs; `auth-google.routes.ts` (initiate + callback); shared rate limiting; OpenAPI entries; supertest happy/failure paths with a fake verifier; **manual verification §11.4** | ~380 | Yes — backend feature complete; web shows no button yet |
| **D** | Web UI | `GoogleLoginButton` (anchor); `api/capabilities.ts`; capability-driven visibility; `login.tsx` `validateSearch` + generic alert; component tests | ~180 | Yes — completes the web feature |

Per-slice boundaries:

| Slice | Starts when | Finishes when | Verified by | Rollback |
|---|---|---|---|---|
| A | design approved | `pnpm api test` green; migration applies | unit tests; `prisma migrate` in CI integration job | revert PR; column becomes inert (nothing reads it) |
| B | A merged | `pnpm api test` + `test:integration` green | unit + integration in CI | revert PR; no runtime path reaches the adapters |
| C1 | B merged | both Google paths return 404; capabilities returns `false`; log-redaction tests green | supertest specs; log regression test | revert PR; `/api/auth/google` returns to 401-by-fallthrough (unreachable state, no client calls it) |
| C2 | C1 merged | full backend flow green **and §11.4 manual checklist pasted in the PR** | supertest + manual gate | revert PR **or** unset the env vars (instant, no deploy) |
| D | C2 merged | button renders/hides correctly; `?error=` alert renders | `pnpm web test` | revert PR; backend stays live and harmless |

Cross-cutting:

- **`.npmrc` gotcha:** `minimum-release-age=10080`. Before slice B, confirm the target `openid-client` v6 release is more than 7 days old or the install is refused. Verify at apply time (`npm view openid-client time`).
- Every slice touches `**/auth/**` → full **4R fan-out** review, and `judgment-day` after **C2** (the security-critical one) as well as after this design.
- `pnpm api env:example` must be re-run in slice B or CI fails.
- `pnpm api openapi:emit` must be re-run in C1 (capabilities) and C2 (the two routes).

---

## 13. Open items for the user (nothing here blocks `sdd-tasks`)

1. **ADR-035 for the mobile mechanism (§9.5).** Design recommends: amend ADR-034 for scope, and write a separate **ADR-035** for M1, because terminating OIDC on the device deviates from ADR-034's "flow terminated in `apps/api`". Confirm, or say you prefer a single amendment.
2. **Mobile as a separate change (§9.4).** Scope is unchanged (Q1 stands, MOB-05 stands); only delivery is split into `auth-google-login-mobile`. Confirm.
3. **Pre-existing log leak (§6.3 b).** If `pino-http` is indeed serialising response headers, `Set-Cookie: md_session=<live token>` is being written to production logs **today**, for password and demo logins. That is independent of this change and arguably deserves its own small fix PR ahead of this chain. Flagging, not deciding.
4. **`?redirect=` is not honoured by the Google flow.** Post-login landing is `/`, per the proposal's assumption. Carrying it would mean adding a sanitised `retorno` field to the transient cookie — cheap, but not requested. Say the word and it moves into C2.
5. **`GOOGLE_REDIRECT_URI` is a third env var (§8).** Additive; the activation gate stays the two credentials, so AUTH-16 holds literally. Noted here so `sdd-verify` does not read it as a spec deviation.
6. **Subdomain cookie-tossing (§3)** remains an accepted, pre-existing bound on `md_session` and now on `md_oauth`. Not introduced here; not fixed here.
