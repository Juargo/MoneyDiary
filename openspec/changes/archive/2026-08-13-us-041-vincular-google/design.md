# Design: US-041 — Link and unlink Google from the profile, API + OIDC only

- **Change**: `us-041-vincular-google`
- **Status**: Designed (2026-08-13)
- **Inputs**: `proposal.md` (binding decisions 1–4, open questions 1–6). The spec
  (`vinculacion-google`, `VINC041-*`) is written in parallel — §1/Q6b hands it a requirement
  skeleton and §9 hands it the design-element → requirement mapping.
- **Precedent**: `openspec/changes/archive/2026-08-13-us-040-editar-perfil/design.md`
  (Q-then-D structure, exhaustive-translator `never` guard, compile-error-as-cleanup-mechanism,
  invariant-in-the-`WHERE`-clause).
- **New ADR**: **No — ADR-034 gets an amendment** (§1/Q6). ADR-005 (layering), ADR-013 (HKDF from
  `ENCRYPTION_KEY`), ADR-028 (Express + manual composition root), ADR-033 (redaction), ADR-036/037
  (demo gate, identity is the owned row), ADR-011/012 (contract-first) all hold unchanged. ADR-035
  (mobile native `id_token`) is untouched — it has no `md_oauth` and no round trip.

---

## 0. Framing

Every other write path in this codebase is guarded by a session that is **present at the moment of
the write**. This one is not, and cannot be: the callback is reached by a genuinely cross-site
top-level navigation, `md_session` is `SameSite=Strict`, and browsers withhold `Strict` cookies on
exactly that hop. So the account that the write targets has to survive the round trip **inside
attacker-reachable storage**.

That single fact is the whole design. Everything else — two use cases, two endpoints, a boolean on a
DTO — is ordinary repo idiom. The parts that are not ordinary are:

1. **Making a cookie field that names an account unforgeable**, with a key that provably is not the
   blind-index key, a message that provably cannot be lifted between flows, and a failure policy that
   never silently downgrades one operation into a different one (§1/Q1, §2/D-01…D-03).
2. **Deriving the demo gate from the row instead of from an input** on the one use case that has no
   session to read it from — which is *stronger* than the compile-required `esDemo` of US-040, not a
   relaxation of it (§2/D-05). The proposal's `esDemo?` optional input is **rejected**: an optional
   gate is precisely the silent-omission hazard `esDemo`-as-required exists to prevent.
3. **Putting the never-leave-an-account-without-access invariant in a `WHERE` clause**, not in an
   application pre-check, so the TOCTOU window does not exist (§1/Q4, §2/D-06).
4. **Splitting the activation gate**: linking needs Google configured, unlinking must work when it is
   not. The proposal is silent on this and the naive wiring produces a `TypeError` → `500` in every
   environment where `GOOGLE_CLIENT_ID` is unset — which includes the API's own test environment
   (§1/Q2b, §2/D-04).

Where this design departs from the proposal the departure is marked **CORRECTION** and carries its
reason. There are **seven** (§1/Q1c, §1/Q2b, §1/Q5a, §2/D-05, §5.2, §6.1, §7).

---

## 1. Open questions resolved

### Q1 — The signed link-intent, in full cryptographic detail

Confirmed in shape, sharpened in three places.

#### Q1a — Key derivation ⇒ **second named export in `derive-blind-index-key.ts`, distinct `info`, asserted by a spec**

```ts
// composition/derive-blind-index-key.ts  (append; HKDF_SALT / HKDF_HASH already exist)

/**
 * Info fijo de la SEGUNDA clave derivada del mismo ENCRYPTION_KEY (US-041):
 * la clave HMAC que firma el link-intent que viaja en `md_oauth`.
 *
 * DEBE ser distinto de BLIND_INDEX_HKDF_INFO. Reusar una clave derivada para
 * un segundo propósito criptográfico es la falla que este `info` existe para
 * impedir: con la misma clave, un blind index de un email cualquiera y un MAC
 * de link-intent son el mismo primitivo y podrían intercambiarse.
 */
export const LINK_INTENT_HKDF_INFO = 'oauth-link-intent-v1';
const LINK_INTENT_KEY_LENGTH_BYTES = 32;

export function deriveLinkIntentKey(encryptionKey: Buffer): Buffer {
  return Buffer.from(
    hkdfSync(
      HKDF_HASH,
      encryptionKey,
      HKDF_SALT,
      Buffer.from(LINK_INTENT_HKDF_INFO),
      LINK_INTENT_KEY_LENGTH_BYTES,
    ),
  );
}
```

- **Same file, deliberately.** That file's docblock exists because a drifted derivation once broke
  login in silence (2026-08-02). Salt, hash and length are single-sourced constants there; a second
  derivation in a second file is exactly how they drift apart. The docblock is **rewritten** to
  describe both derivations and to state the "one `ENCRYPTION_KEY`, N purpose-separated keys" rule —
  a docblock that still says "la clave HMAC de `HmacBlindIndexService`" after this change would be
  the `dry` anti-pattern "docs que repiten código" and would mislead the next reader.
- **No new env var**, consistent with US-035 and ADR-013.
- **The separation is asserted, not asserted-in-prose**: `derive-blind-index-key.spec.ts` gains
  `expect(deriveLinkIntentKey(k).equals(deriveBlindIndexKey(k))).toBe(false)` for a fixed `k`, plus
  `expect(LINK_INTENT_HKDF_INFO).not.toBe(BLIND_INDEX_HKDF_INFO)`. The first is the real test (it
  fails if someone copy-pastes the derivation and forgets to swap the `info`); the second is the
  cheap tripwire.
- **Both keys are 32 bytes and both are `Buffer`s** — structurally interchangeable at the type
  level, so the type system cannot help here. That is why the composition root passes each one to
  exactly one consumer and never through a shared "keys" bag (§3.4).

#### Q1b — What is signed ⇒ **`state` and `userId`, in a length-prefixed canonical encoding** *(CORRECTION to `${state}.${userId}`)*

```ts
// infrastructure/http/auth/link-intent.ts

/**
 * Mensaje canónico del MAC. Length-prefixed, NO `${state}.${userId}`:
 * con un separador simple, `("a.b","c")` y `("a","b.c")` producen el MISMO
 * mensaje. Hoy eso no es explotable (`state` lo genera openid-client y
 * `userId` sale de la sesión — ninguno lo controla el atacante), pero esa
 * seguridad depende del alfabeto de `state`, que es una propiedad de una
 * librería de terceros que este repo no fija ni testea. Un prefijo de largo
 * hace la codificación inyectiva por construcción, cuesta una línea y deja de
 * depender de nada externo.
 */
function mensajeLinkIntent(state: string, userId: string): Buffer {
  return Buffer.from(
    `${Buffer.byteLength(state, 'utf8')}:${state}:${Buffer.byteLength(userId, 'utf8')}:${userId}`,
    'utf8',
  );
}
```

Why these two fields and no others:

| Field | Signed? | Why |
|---|---|---|
| `userId` | **Yes** | It is the only *claim about an account* in the payload. Claims need integrity; the rest of the payload proves itself. |
| `state` | **Yes** | 32 bytes of fresh randomness per flow, already validated against the query parameter before the MAC is checked. Binding to it is what makes the signature **non-transferable between flows**: a MAC lifted from flow A cannot be paired with flow B's `state`. Signing `userId` alone would produce a permanently replayable capability for that account. |
| `nonce`, `codeVerifier` | No | `codeVerifier` proves itself at Google's token endpoint; `nonce` is checked inside the id_token by the OIDC adapter. Neither names an account. |
| The whole payload | No | It would change the byte shape of the **login-only** cookie for zero gain, and the login path must stay byte-identical (§6.1). |

#### Q1c — Encoding, comparison and the exact failure policy

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Lo que viaja dentro de `md_oauth.link` — el userId destino y su MAC. */
export interface LinkIntent {
  readonly userId: string;
  readonly mac: string; // base64url de 32 bytes (43 chars)
}

export function firmarLinkIntent(
  key: Buffer,
  state: string,
  userId: string,
): LinkIntent {
  const mac = createHmac('sha256', key)
    .update(mensajeLinkIntent(state, userId))
    .digest('base64url');
  return { userId, mac };
}

/**
 * `state` es el que la ruta YA validó contra el query param — nunca el de la
 * cookie sin validar. Fail-closed: cualquier forma inesperada ⇒ `false`,
 * nunca un throw.
 */
export function verificarLinkIntent(
  key: Buffer,
  state: string,
  intent: LinkIntent,
): boolean {
  const esperado = createHmac('sha256', key)
    .update(mensajeLinkIntent(state, intent.userId))
    .digest();
  const recibido = Buffer.from(intent.mac, 'base64url');
  // timingSafeEqual LANZA si los largos difieren. El chequeo explícito
  // mantiene la postura fail-closed en vez de convertir una cookie forjada en
  // un 500. También cubre el base64url inválido: Buffer.from(..., 'base64url')
  // NO lanza — descarta los chars inválidos y devuelve un buffer más corto.
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}
```

**Failure policy — validated, not merely adopted: `link` present + MAC invalid ⇒ reject the whole
callback. Never fall back to login.**

The proposal says "a different operation than the one requested, decided by an attacker-controllable
byte". That is right, and it is worth being concrete about what the downgrade would actually do:
falling back to login runs the *implicit, email-matched* path, which (a) may write a `googleSub` via
a completely different rule than the one the user asked for, and (b) **issues a session**, which link
mode deliberately does not. So the fallback is not "a slightly worse outcome" — it is a privilege
escalation from "no session issued" to "session issued", selected by a byte an attacker can flip.
Rejecting costs a legitimate user nothing: anyone who wants to log in can start a login flow.

**Where the rejection lands**: the standard `GENERIC_FAILURE_REDIRECT` (`/login?error=google`), **not**
`/configuracion?google=error`. Reason: the `link` field failed to authenticate, so nothing in it —
including the mere fact that it was present — may steer the response. Choosing the link-mode redirect
would be trusting unauthenticated content to pick a target. Both targets are fixed constants, so
neither is an open redirect; the choice is about not letting forged input influence behaviour at all.

**Ordering — verify the MAC immediately after the `state` check and BEFORE `verificador.verificar()`.**
Three reasons: the MAC binds to `state`, so the state check must come first for the binding to mean
anything; a forged cookie then never causes a network call to Google (the same DoS-amplification
reasoning that already made the callback share the `google:ip:` budget); and the authorization `code`
is never consumed by a request that was going to be rejected anyway.

**Logging**: `.warn('Google callback rechazado (link-intent inválido)', { path })`. **No `userId`, no
`mac`, no `state`** — the whole point is that none of those values is trusted at that moment. This is
the one *distinguishable log line* the mechanism buys (an unforgeable-cookie failure is not a normal
auth failure), while the HTTP response stays indistinguishable (AUTH-15).

#### Q1d — Why a signed `userId` is sufficient authorisation at the callback

Restated because "no session at the callback" reads like a hole. The signature can only exist if this
server produced it, and it only produces one after: a valid `md_session` for that `userId`, a
non-demo account, a **correct current password**, and a fresh random `state`. It then lives in an
`HttpOnly`, `Path`-scoped, 10-minute cookie cleared on **every** callback exit. That is a short-lived
capability token issued to an authenticated *and re-authenticated* session — the same trust model the
existing flow already places in `state`/`codeVerifier`, which today authorise issuing a **full
session** from cookie-carried material. This change does not lower that bar; it adds integrity
because the payload now names a specific account.

**What it does not defend, stated honestly**: an attacker who can **read** `md_oauth` (not merely set
it) can complete the flow themselves and link *their* Google account to the victim's row. Reading an
`HttpOnly`, `Secure`, `Path`-scoped cookie requires the same capability that already yields the
session cookie, so this adds no new exposure — but the distinction matters: the MAC defends against
cookie **forgery** (easy: any sibling host or an active MITM can *set* a cookie without reading
anything), not cookie **theft**. Recorded in §8.

#### Q1e — Rejected: a server-side `state → userId` record

Conceptually the strongest option — nothing account-naming ever leaves the server. Rejected because
it buys a table (or a second ephemeral store), a TTL, an expiry sweep and a second
demo-cleanup-shaped job, to protect a value that lives for seconds and is already protected by a MAC
this codebase knows how to compute (`yagni`, `kiss`). **Recorded as the escalation path** if the
link-intent ever needs to carry more than a user id — the moment it carries two claims, or a claim
whose value is itself sensitive, the cookie stops being the right place.

---

### Q2 — Callback branching: one route or two?

#### Q2a — **One route, branching. Confirmed — argued against the code's actual shape.**

`registrarAuthGoogle`'s callback handler is a single function whose first **six** steps are shared by
both modes and are all security-relevant: clear `md_oauth` before any other work → Sec-Fetch
top-level-navigation guard → rate limiter → parse the cookie → validate `state` against the query
param → `verificador.verificar()`. Only the **last two decisions** differ (which use case, which
redirect). A second route means either duplicating six security steps (and every future edit to
them), or extracting a shared pipeline whose only job is to serve two callers — the classic wrong
abstraction.

Add the operational cost the proposal already names: a second registered redirect URI **per
environment** in Google Cloud Console, a second env var, a second Sec-Fetch and rate-limit surface —
to distinguish two modes that a signed cookie field already distinguishes. **Rejected.**

**Keeping the handler readable (`kiss`, ≤3 nesting levels).** The two tails move into two private
functions in the same file, each with one job:

```ts
async function completarLogin(res, deps, identidad): Promise<void>   // existing tail, unchanged
async function completarVinculacion(res, deps, userId, sub): Promise<void>  // new tail
```

The handler's branch is then three lines and the diff on the login tail is a pure move — which is
what makes the "the no-`link` path is byte-identical" claim reviewable (§6.1).

#### Q2b — **CORRECTION: link *initiation* needs its own activation gate; unlink must not have one**

The proposal treats `POST /api/perfil/google/vincular` as an ordinary `/api/perfil` endpoint. It is
not: it calls `iniciador.iniciar()`, which only exists when `container.googleAuth !== undefined`
(`GOOGLE_CLIENT_ID`/`SECRET` present). Mounting it unconditionally produces a `TypeError` → `500` in
every environment where Google is off — **including the API's own test environment**, where no
`GOOGLE_*` var is set (verified: `auth-google-callback.int-spec.ts` self-provisions them precisely
because CI's integration job never does).

Worse, "just don't mount it" does not work either, and the codebase already documents why:
`protectedApi` mounts `sessionMiddleware` via `router.use(mw)`, which runs for **every** request that
reaches the router, matched or not — so an unmounted path answers `401`, not `404`
(`registrarAuthGoogleDeshabilitado`'s docblock, AUTH-16).

**Decision — three registrar functions in `perfil-google.routes.ts`, gated asymmetrically:**

| Function | Mounted | Gate |
|---|---|---|
| `registrarPerfilGoogleVincular(router, deps)` | on `protectedApi` when `container.googleAuth !== undefined` | Google on |
| `registrarPerfilGoogleVincularDeshabilitado(router)` | on `protectedApi` otherwise — `404` on `POST /perfil/google/vincular` | Google off |
| `registrarPerfilGoogleDesvincular(router, perfil)` | on `protectedApi` **always** | none |

**Unlink has no gate, deliberately, and this is a safety property, not an omission.** A user who
linked while the feature was on must be able to unlink after it is turned off — otherwise a
configuration change traps a permanent access method on their account, which is the exact posture
this change exists to remove. Clearing a `googleSub` needs no OIDC client, no discovery, no
credentials.

This mirrors the established `registrarAuthGoogle` / `registrarAuthGoogleDeshabilitado` idiom rather
than inventing a per-handler feature flag — which the existing docblock explicitly rejected ("no un
guard-clause dentro de cada handler"). The activation question stays exactly one:
`container.googleAuth !== undefined`.

#### Q2c — Link mode issues no session. Confirmed.

The user's `md_session` was never deleted — it was *withheld* on the cross-site hop. The moment the
browser follows the `302` back to `app.moneydiary.cl`, that same-site navigation carries it again and
the user is still logged in. Issuing a fresh session in link mode would be a silent, unrequested
session rotation, and would make a successful link indistinguishable from a login in the session
table.

---

### Q3 — Where the current password is verified ⇒ **at initiation, in a JSON endpoint. It cannot live at the callback, and the reason is structural.**

Confirmed as the proposal leans; the argument is worth stating in its final form because it is what
forces leg 1 to exist at all.

**It cannot be at the callback**: the callback is reached by Google's redirect. There is no request
body, no session cookie, and no way for the user to type anything — the only inputs are the query
string and `md_oauth`. Carrying a password (or a password-derived value) through the round trip would
mean putting secret material in a cookie that survives a cross-site hop, which is strictly worse than
what this design already refuses to do with a plain user id.

**It cannot be on a redirect-style initiate either**: the existing `GET /api/auth/google` is an
`<a href>` top-level navigation. A password on that hop would be a query parameter — i.e. in server
logs, browser history and `Referer`.

**Therefore leg 1 is a normal authenticated JSON `POST`** under `protectedApi`, where `req.userId`
and `req.esDemo` come free from `sessionMiddleware`, the body carries `passwordActual`, and the
response carries the authorization URL:

```
POST /api/perfil/google/vincular   { passwordActual }
  → 200 { urlAutorizacion }  +  Set-Cookie: md_oauth (state, nonce, codeVerifier, link{userId, mac})
```

The client then does one line — `location.assign(urlAutorizacion)` — straight to
`accounts.google.com`, never through our API, so no Sec-Fetch guard applies to that hop. **US-042
writes that line; this change does not.**

Two details this design pins because they are easy to get wrong:

- **`md_oauth` keeps `Path=/api/auth/google` even though it is set from `/api/perfil/...`.** RFC 6265
  places no constraint tying `Set-Cookie`'s `Path` attribute to the request path (unlike `Domain`,
  which *is* constrained). The cookie only needs to be **readable** at the callback. Keeping the
  scope unchanged means the link flow adds **zero** new cookie surface. Pinned by an integration
  assertion on the raw `Set-Cookie` header (§6.4).
- **The Vercel proxy relays it unchanged.** `apps/web/api/proxy.ts` copies every non-hop-by-hop
  upstream response header verbatim, including `Set-Cookie` — that is how the demo flow's cookie
  already reaches the browser. **No `apps/web` change is required.**

**CSRF on the two new `POST`s needs no new mechanism**: `md_session` is `SameSite=Strict`, so a
cross-site `POST` arrives with no session at all and `sessionMiddleware` rejects it before any handler
runs. Same protection every `PATCH /api/perfil*` endpoint already relies on.

**Rate limiting stays deferred**, matching US-040's recorded deferral: both endpoints sit behind
`x-api-key` **and** a valid session, so the password oracle they expose is only reachable by someone
who already holds the account's session. Trigger unchanged: first sign of abuse ⇒ reuse
`demoRateLimiter`'s shape. The **callback** keeps the existing shared `googleRateLimiter`.

---

### Q4 — CA-03's single conditional write ⇒ **confirmed, with the exact predicate and the exact meaning of every outcome**

```ts
// IIdentidadGoogleRepository (new method)
/**
 * VINC041-05. Limpia `googleSub` SOLO si la cuenta conserva un
 * `passwordHash` — el invariante "ninguna cuenta queda sin forma de entrar"
 * vive en este WHERE, no en un chequeo previo de la capa de aplicación.
 * Postgres evalúa el predicado y el UPDATE en UNA sentencia: no hay ventana
 * TOCTOU entre "¿tiene password?" y "borrá el link".
 * `true` ⇒ se limpió un link. `false` ⇒ no había nada que limpiar (ver design §4.3).
 */
desvincularGoogleSub(userId: string): Promise<boolean>;
```

```ts
const { count } = await this.prisma.user.updateMany({
  where: { id: userId, passwordHash: { not: null }, googleSub: { not: null } },
  data:  { googleSub: null },
});
return count === 1;
```

- **Same idiom as `vincularGoogleSub`** (`updateMany` + conditional `WHERE` + `count === 1`), which
  is why this needs no new pattern and no ADR. `kiss` rule 2: prefer the pattern the repo already has.
- **`googleSub: { not: null }` is in the `WHERE` even though it is not part of the invariant.** It is
  what makes `count === 0` mean *"there was nothing to clear"* — the idempotent case — instead of
  being ambiguous with a successful no-op. It costs nothing and it is what §4.3's outcome table
  leans on.
- **No `try/catch`**: this write touches no unique column, so there is no `P2002` to model. Any Prisma
  error is a real infrastructure failure and must propagate to `errorMiddleware` (`500`).

**What `false` means, exhaustively:**

| Cause of `count === 0` | Reachable? | Response |
|---|---|---|
| The row had no `googleSub` | Yes (double-submit, stale UI) | **`204`** — the requested end state already holds. Idempotent. |
| `passwordHash` became `null` between the read and the write | **No** — only `seed.ts` and `actualizarPassword` ever write `passwordHash`, and neither can write `null` (verified) | `204`, and the `WHERE` guarantees the safe outcome anyway: the link stays, the account keeps an access method. Fail-closed by construction. |
| The row was deleted mid-request | Vanishingly | `204`. Harmless — the caller's session dies on its next request. |

**Which error a refusal maps to, and why it is NOT derived from the write.** The specific error comes
from the application-layer read, one step earlier:

```
demo gate                       ⇒ PerfilDemoSoloLecturaError   (403 DEMO_SOLO_LECTURA)
buscarCredencialPorId → null    ⇒ VinculoRequierePasswordError (403 VINCULO_REQUIERE_PASSWORD)
hasher.verificar false          ⇒ PerfilRechazadoError         (403 PERFIL_RECHAZADO, reused)
desvincularGoogleSub(userId)    ⇒ 204 for true AND for false
```

The read is **for the message; the `WHERE` is for the invariant**. `buscarCredencialPorId` returns
`null` *exactly when* the account has no `passwordHash` — which **is** CA-03's condition — so the
error and the guard fall out of a read the use case already needs for the password check. Zero extra
queries.

**"You have no password" is a specific error, not the generic one.** It reveals nothing about any
other account: it is a statement about the caller's own credentials, to a caller who has already
proven session ownership. Collapsing it into `PERFIL_RECHAZADO` would tell a user to "check your
data" when the true answer is *"set a password first"*. Anti-enumeration protects **other** accounts;
it is not a reason to be unhelpful about your own. (It is currently **unreachable** — no real user can
be passwordless, verified in the proposal — it exists so the refusal is already correct and already
tested the day registration or Google-first signup arrives. This is also the resolution of US-040's
recorded "Google-only user" debt: it stays unreachable, and it now has a correct, tested refusal.)

---

### Q5 — Where the link state lives, and the client fallout

#### Q5a — **`IdentidadUsuario` gains required `googleVinculado: boolean`; one query, one mapper** *(with a CORRECTION to the proposal's fixture list)*

```ts
// application/ports/user-credential-repository.port.ts
export interface IdentidadUsuario {
  readonly userId: string;
  readonly nombre: string;
  readonly email: string | null;
  readonly esDemo: boolean;
  /** VINC041-06. Derivado de `googleSub !== null`. El `googleSub` CRUDO nunca
   *  cruza este puerto: es un identificador estable de una identidad externa
   *  y no tiene ninguna razón para estar en un tipo que se serializa al wire. */
  readonly googleVinculado: boolean;
}
```

- `PrismaUserCredentialRepository.buscarIdentidad` adds `googleSub: true` to its **existing**
  `select`; the shared private `aIdentidadUsuario(row)` maps `googleVinculado = row.googleSub !== null`.
  Because `actualizarPerfil` maps through the **same** private mapper, `PATCH /api/perfil` gains the
  field for free and cannot drift from `GET /api/auth/me` — that is the payoff of US-040's
  one-identity-shape decision. `actualizarPerfil`'s `select` gains `googleSub` too.
- `authMeResponseSchema` gains `googleVinculado: z.boolean()`. `authMeOperation` needs **no edit** —
  it already `$ref`s the schema.
- **Required, not optional**: an optional field lets a producer forget it in silence. Required makes
  every fixture that builds an `IdentidadUsuario` a compile error until it is updated — the D-06
  mechanism, used on purpose (§6.2).

**CORRECTION — the proposal's client-fixture table is incomplete.** Verified by reading every
`MeDto`-typed literal in the repo. The blast radius is **five** files, not four:

| File | `MeDto` literals | Gate that catches it |
|---|---|---|
| `apps/web/src/api/auth.test.ts` | 2 (`validMeDto`, `validDemoMeDto`) | `pnpm web typecheck` — **not** `pnpm web test` |
| **`apps/web/src/lib/require-session.test.ts`** | **2** (lines 91, 106) — **missing from the proposal** | `pnpm web typecheck` |
| `apps/mobile/src/api/client.spec.ts` | 1 (`validMeDto`) | `pnpm --filter @moneydiary/mobile exec tsc --noEmit` |
| `apps/mobile/src/api/session-context.spec.tsx` | 1 (`meDto`) | idem |
| `apps/mobile/test/auth-navigation.integration.spec.tsx` | 1 (`meOk`) — **already missing `nombre`** | **nothing** (see Q5b) |

Both typecheck commands are already in `.github/workflows/ci.yml` and are **mandatory verification
steps** for this change (§6.6). `pnpm web test` passing means nothing here — Vitest does not
typecheck.

**The `esMeDto` / mobile `esMeDto` runtime guards are deliberately NOT extended.** They are
`apps/web` / `apps/mobile` *source*, and the boundary is binding (US-040 set the identical precedent
with `nombre`). Recorded as a hand-off: **US-042 extends the guard when it starts consuming
`googleVinculado`.** Until then the guard narrows to a type carrying a field it does not check —
a known, bounded lie, identical in kind to the one `nombre` already carries.

#### Q5b — The mobile `test/` typecheck hole ⇒ **fix the fixture here; record the tsconfig widening as separate debt**

Verified: `apps/mobile/tsconfig.json`'s `include` is `["app", "src", "*.ts", "*.tsx", "nativewind-env.d.ts"]` —
`test/` is **never** typechecked, which is why `auth-navigation.integration.spec.tsx`'s `meOk` still
lacks `nombre` from US-040 and nothing went red.

**Decision, two parts:**

1. **Fix the fixture in this change** (add both `nombre` and `googleVinculado`). It costs one line,
   it is in a file this change touches anyway, and leaving a fixture that contradicts the DTO is a
   trap for the next reader. Note honestly that **nothing enforces this** — it is discipline, and the
   task list must name the file explicitly or it will be forgotten again.
2. **Widening `include` to `test/` is out of scope and becomes its own item.** It is not a one-liner:
   the directory has never been typechecked, so the true error count is unknown, and discovering it
   inside a change that carries a cryptographic mechanism is exactly the wrong place to find out.
   **Action item for the tasks phase**: open a debt issue "typecheck `apps/mobile/test/`", referencing
   this section and the US-040 drift as the evidence that the gap is not theoretical.

---

### Q6 — ADR-034: amendment, and its exact wording scope

#### Q6a — **Amendment, not a new ADR. Confirmed, with the boundary made explicit.**

The test is not "how much code does it add" — it is *does it contradict a commitment the ADR made?*
ADR-035 earned its own ADR because it **deviated**: the flow stopped terminating in `apps/api`.
US-041 deviates from nothing — same `openid-client` adapter, same single registered redirect URI,
same callback route, same session model, same web-only scope, same "no Google tokens persisted". It
adds a second **entry point** into a decided flow. A new ADR would fragment one decision across two
documents and force every future reader to reconcile them.

**The boundary for the future**: a *mobile* link flow **would** be a new ADR — it has no `md_oauth`,
no redirect round trip, and therefore none of this mechanism (exactly the ADR-035 shape).

#### Q6b — The amendment states four things, and only these four

Appended to `docs/adr/ADR-034-login-con-google-oidc.md` as an `## Amendment (US-041, 2026-08-13)`
section — the original decision text is **not** rewritten, so the record of what was decided when
survives.

1. **Linking now has two pathways.** *Implicit*: email-matched, `email_verified`-gated, occurring only
   during login (unchanged). *Explicit*: `userId`-bound, session-authenticated,
   password-re-verified, initiated from the profile. **The `email_verified` gate belongs to the first
   only** — on the implicit path the email *is* the binding key, so an unverified email would let
   anyone minting a Google account with your address claim your row; on the explicit path the email is
   never consulted, never compared and never used to select a row, so there is nothing for the gate to
   protect. Requiring it would only break the legitimate case of a user whose Google account is not
   the one they registered with. (Consistent with existing behaviour: once linked, login resolves
   through `buscarPorGoogleSub` *before* any email gate.)
2. **The callback is dual-purpose**, distinguished by an **HMAC-signed** link marker inside `md_oauth`
   — not by a second redirect URI. `md_oauth`'s original "unsigned by design" rationale is
   **superseded for the field that names an account**, and the amendment quotes the original sentence
   and says why it stopped holding: the argument was "an attacker who can set a cookie doesn't need to
   forge content — they can start their own flow", which dies the moment the content names *someone
   else's* account.
3. **The ★ no-re-link rule is enforced at two call sites over one database-level invariant**
   (`googleSub @unique` plus a conditional `updateMany`), not inside a single use case.
4. **New account invariant, first-class**: *an account must never be left without an access method.*
   `googleSub` may only be cleared while `passwordHash IS NOT NULL`, enforced in the `WHERE` clause of
   the unlink statement.

---

### Resolutions of the proposal's own open questions

| # | Question | Resolution |
|---|---|---|
| **P1** | Is `409 GOOGLE_YA_VINCULADO` on leg 1 worth it? | **Keep it.** Cost accounted honestly: one extra read (`identidades.buscarPorId`), one error class, one translator branch, one OpenAPI response — on an endpoint that already runs argon2 (tens of ms), so the query is noise. Value: a user is not sent to a consent screen guaranteed to fail. It is documented as **UX, not a security control** — the real control is step 3 of `VincularGoogleUseCase` (§4.2). **Ordering matters**: the read runs *after* the password verification, because a `409` discloses a fact about the account, and gating a state disclosure behind the password is free. (This inverts US-040's "cheap checks first" only where a cheap check leaks state.) |
| **P2** | Should the link failure redirect distinguish "that Google account belongs to someone else"? | **No.** One failure value, AUTH-15 parity. The distinction is exactly the enumeration oracle the ★ rule exists to deny: it would let anyone with a Google account probe whether a given identity is already attached to *some* MoneyDiary account. Revisit only if support traffic shows users cannot tell what went wrong — and then the fix is UI copy on `?google=error`, not a second query parameter value. |
| **P3** | Exact redirect path | **`/configuracion?google=vinculado` on success, `/configuracion?google=error` on a link-mode failure.** Two `const`s at the top of `auth-google.routes.ts`, beside the existing `GENERIC_FAILURE_REDIRECT`. ⚠️ **Verified: `/configuracion` does not exist in `apps/web/src/routes/` yet** — US-042 creates it. The target is therefore a **forward contract**, unreachable until US-042 ships (no client can start a link flow before then). The cross-workspace single source is the **spec** plus the OpenAPI `description`; `apps/web` cannot import an API constant (ADR-008). |
| **P4** | `VINC041-*` numbering and spec placement | **One new capability `vinculacion-google` + deltas only where an existing requirement literally changes.** Deltas: `user-authentication` AUTH-09 (`googleVinculado` on the identity payload), AUTH-12 (the callback is dual-mode), AUTH-14 (the `email_verified` gate is scoped to email-matched linking). `perfil-usuario` gets **no** requirement change — the new endpoints live under `/api/perfil` and reuse its demo gate, translator and `PerfilRechazadoError`, but they are Google-identity requirements. Same boundary logic US-040 used for PERF040-06: file it where the *claim* is true. Suggested inventory for `sdd-spec`: **VINC041-01** initiation gates (session + non-demo + current password); **-02** the link-intent is unforgeable; **-03** dual-mode callback, link mode issues no session; **-04** ★ never steal or overwrite an identity; **-05** unlink requires the password and never leaves an account without access; **-06** the link state is exposed on the identity read; **-07** demo sessions can neither link nor unlink; **-08** no Google token persisted, every operation self-scoped; **-09** the operations are published in the generated contract. |
| **P5** | Rename `derive-blind-index-key.ts` → `derive-keys.ts` | **Defer.** Pure import churn in `container.ts`, `seed.ts`, `backfill-email-blind-index.ts` and specs for zero behaviour change, inside a change that already touches an auth hot path. **Non-negotiable substitute**: the file's docblock is rewritten to describe *both* derivations and the purpose-separation rule (§1/Q1a). A stale docblock is the actual harm; the filename is cosmetic. **Trigger: a third derived key.** |
| **P6** | Should `md_oauth`'s `Max-Age` shrink for link mode? | **No.** One constant, one behaviour. A second value would have to be threaded through `serializeOauthCookie` as a parameter, adding a knob to a security-relevant function for a bound the MAC already provides: the clock is not what makes a forged intent fail. |

---

## 2. Architecture decisions (D-numbered)

### D-01 — Cookie integrity is a **transport** concern; the application layer never learns a MAC exists

`link-intent.ts` lives in `infrastructure/http/auth/`, beside `oauth-transient-cookie.ts`, as **plain
functions taking the key** — not a class, not a port, not an injected service. The route signs and
verifies; `VincularGoogleUseCase` receives a `userId` it can trust, exactly as every other use case
receives one from `sessionMiddleware`.

This is ADR-005 applied literally: a MAC over a cookie field is a property of how the request travelled,
not of the business rule. A port would let a use case ask "was this signed?", which is a question the
application layer must never be able to ask — because the only correct answer is "you would not have
been called otherwise".

**No class, no DI**: `oauth-transient-cookie.ts` and `cookie.ts` are both plain functions with
parameter-threaded configuration (`secure`, and now `key`). Same shape, same testability (a spec calls
them with a fixed key), zero wiring.

### D-02 — Purpose separation is enforced by an `info` string **and** by a spec, never by convention

Two 32-byte `Buffer`s are structurally identical; TypeScript cannot tell them apart. The defences are
therefore: one file owning both derivations, distinct exported `info` constants, a spec asserting the
two derived keys **differ for the same `ENCRYPTION_KEY`**, and a composition root that hands each key
to exactly one consumer (§3.4). No "keys" bag object — a bag is how a wrong key gets passed to the
wrong consumer without anyone noticing.

### D-03 — The callback branches on a **verified** field, and rejects on anything else

Three states, three behaviours, no fourth:

| `md_oauth.link` | Behaviour |
|---|---|
| absent | Login. **Byte-identical to today** — same use case, same session issuance, same `/` redirect. |
| present, MAC verifies against the validated `state` | Link. No session. `/configuracion?google=vinculado` on success, `/configuracion?google=error` on a modelled failure. |
| present, MAC does not verify (tampered, cross-flow, absent, wrong length, bad base64url) | **Reject the whole callback**: generic `/login?error=google`, **zero writes**, distinguishable `.warn` log line with no PII. |

`parseOauthCookie`'s existing fail-closed contract extends unchanged: `link` present but malformed
(not an object, missing `userId` or `mac`, wrong types) ⇒ the **whole cookie** parses to `undefined`
⇒ the `state` check fails ⇒ generic failure. There is no path from a malformed cookie to a throw and
none to a write.

### D-04 — The activation seam stays exactly one question

`container.googleAuth !== undefined` remains the *only* "is Google on?" test in the codebase.
Consequences, decided here:

- `GoogleAuthGraph` gains `iniciarVinculacion` and `vincularGoogle` — both are meaningless without
  Google, both die with the same gate, and no second optional field is introduced anywhere.
- `crearAuthGoogle` gains a `crypto: ICryptoService` parameter (it must build a
  `PrismaUserCredentialRepository` for the password verification), making its signature an exact
  mirror of `crearPerfil(prisma, crypto, blindIndex, logger)`.
- `DesvincularGoogleUseCase` goes in `PerfilGraph` (§1/Q2b): it must work when Google is off.

**Rejected**: putting `IniciarVinculacionGoogleUseCase` in `PerfilGraph` with an optional
`iniciarVinculacion?` field fed from `googleAuth?.iniciador`. It works, but it puts the activation
question in a second place, and "which optional field do I check?" is how a `404` turns into a `500`
one refactor later.

### D-05 — **CORRECTION**: `esDemo` is a required *input* where a session exists, and **read-derived** where it does not

| Use case | Where `esDemo` comes from | Why |
|---|---|---|
| `IniciarVinculacionGoogleUseCase` | **required input**, from `req.esDemo!` | A session exists. Forgetting to thread it is a compile error (US-040 D-05 idiom). |
| `DesvincularGoogleUseCase` | **required input**, from `req.esDemo!` | idem |
| `VincularGoogleUseCase` | **read from the row** via `buscarPorId`, **no input field** | There is no session at the callback *by construction*. Passing an `esDemo` would mean inventing a claim; passing an **optional** `esDemo?` — as the proposal sketches — would recreate exactly the silent-omission hazard the required-input rule exists to prevent. |

The read-derived gate is **stronger**, not weaker: it cannot be spoofed by any caller, and it is
evaluated against the database at the moment of the write. It is also free — `buscarPorId` is needed
anyway for steps 2–3 of the resolution.

**Therefore `VincularGoogleUseCase.execute` takes exactly `{ userId, sub }`** — which doubles as
CA-05's structural proof: there is no field a Google token could be passed into, so no field one could
be persisted from (§6.2).

### D-06 — The account-access invariant lives in a `WHERE` clause, not in an `if`

Stated in full in §1/Q4. The design-level claim: *a pre-check plus a write is two statements and a
window; a conditional write is one statement and no window.* The application layer still reads first,
but only to produce a good message. If the read and the `WHERE` ever disagree, the `WHERE` wins and the
outcome is safe.

### D-07 — Every new gate is a compile error when omitted

The tasks phase should sequence by making each type change first and letting `tsc --noEmit` enumerate
the fallout (US-039/US-040 precedent). **Do not hunt references by grep.**

| Type change | What deliberately breaks |
|---|---|
| `IdentidadUsuario` gains required `googleVinculado` | every API fixture building one (§6.1), plus five client fixture files (§1/Q5a) |
| `IIdentidadGoogleRepository` gains `buscarPorId` + `desvincularGoogleSub` | exactly **one** site: `test/support/identidad-google-repository.double.ts` (verified — it is the only double of that port, shared by `login-con-google.use-case.spec.ts` and `identidad-google-repository.port.spec.ts`) |
| `OauthTransientState` gains optional `link` | nothing (optional, additive) — which is why the parser's shape validation carries the weight instead (§6.2) |
| `AuthGoogleDeps` gains `vincularGoogle` + `linkIntentKey` | `auth-google.routes.spec.ts` deps literals, `auth-google-callback.int-spec.ts`'s hand-built graph (§6.1) |
| `GoogleAuthGraph` gains two use cases | `crear-auth-google.spec.ts`, `app.ts`, and the int-spec above |
| `aPerfilHttpError`'s `const _exhaustive: never` | any new error class not mapped — **and**, in the other direction, adding `VinculacionGoogleFallidaError` to that union stops compiling, which is the proof it never reaches an HTTP body (it only ever produces a `302`) |

### D-08 — One generic rejection is reused; two specific ones are added

| Situation | Error | HTTP |
|---|---|---|
| Wrong `passwordActual` on either endpoint | **`PerfilRechazadoError`, reused verbatim** | `403 PERFIL_RECHAZADO` |
| Demo session on either endpoint | **`PerfilDemoSoloLecturaError`, reused verbatim** | `403 DEMO_SOLO_LECTURA` |
| Unlink with no password on the account | `VinculoRequierePasswordError` (**new**) | `403 VINCULO_REQUIERE_PASSWORD` |
| Link initiation while already linked | `GoogleYaVinculadoError` (**new**) | `409 GOOGLE_YA_VINCULADO` |
| `iniciador.iniciar()` fails (Google discovery/authorization unreachable) | `VinculacionGoogleNoDisponibleError` (**new**) | `503 GOOGLE_NO_DISPONIBLE` |
| Any failure inside `VincularGoogleUseCase` | `VinculacionGoogleFallidaError` (**new**) — carries a `motivo` for logging only | **never an HTTP body**: `302 /configuracion?google=error` |

Reusing `PerfilRechazadoError` rather than minting a link-specific twin: its message is already
generic ("Revisá los datos ingresados"), its `code` is what US-042 keys on, and a second class with an
identical role would fragment the one-generic-rejection concept for no gain (`dry`).

`VinculacionGoogleFallidaError` mirrors `LoginConGoogleFallidoError`'s **shape** (a `motivo` union
feeding a `.warn` line) but is a **separate class with its own union** — same reasoning that made
`aPerfilHttpError` a separate translator from `aCatalogoHttpError`. Reusing the login error for a link
operation would mean a `motivo` union carrying `'sin-match'` and `'email-no-verificado'`, values the
link path can never produce. *(Naming note: the proposal called this file
`vinculacion-rechazada.error.ts`; renamed to `vinculacion-google-fallida.error.ts` for symmetry with
`login-con-google-fallido.error.ts`.)*

### D-09 — Nothing new enters the logs, and three values are named as never-loggable

No new `SENSITIVE_REDACT_PATHS` entry is needed — but the rule (ADR-033: **log field names and
booleans, never values**) is restated here for three values this change introduces or handles:

- **`googleSub`** — never logged, in any branch, at any level. It is a stable external identifier.
- **the MAC and the link key** — never logged. A logged MAC plus a logged `state` is an oracle.
- **`userId` in the link-intent-rejected branch** — never logged, because at that moment it is
  *unauthenticated attacker input*, not a fact.

Log lines added by this change are booleans and outcomes only:

```ts
this.logger.debug('iniciar-vinculacion-google: verificación de password actual', { passwordValida });
this.logger.debug('vincular-google: estado del vínculo', { yaVinculadoAlMismoSub, tieneOtroSub });
this.logger.debug('desvincular-google: outcome del write condicional', { limpio });
appLogger.warn('Google callback rechazado (link-intent inválido)', { path: req.path });
```

---

## 3. Module and layer map

Refines the proposal's affected-areas table. **Bold rows are corrections or additions.**

### 3.1 `domain/`

| File | Action | Detail |
|---|---|---|
| `errors/vinculo-requiere-password.error.ts` (+ spec) | **New** | Fixed message pointing at *"configurá una contraseña antes de desvincular Google"*. No interpolated input. |
| `errors/google-ya-vinculado.error.ts` (+ spec) | **New** | Fixed message. Docblock: **UX pre-flight, not a security control** (§P1). |
| `errors/vinculacion-google-no-disponible.error.ts` (+ spec) | **New** | Dependency outage, not a client error. |
| **`errors/vinculacion-google-fallida.error.ts` (+ spec)** | **New** *(renamed from the proposal)* | `motivo: 'usuario-inexistente' \| 'usuario-demo' \| 'identidad-de-otra-cuenta' \| 'ya-tiene-otro-sub' \| 'link-perdio-la-carrera'`. Docblock: **never crosses the HTTP boundary** — the callback answers `302` for every outcome; `motivo` exists only for the `.warn` line. |
| `errors/perfil-rechazado.error.ts`, `perfil-demo-solo-lectura.error.ts` | **Unchanged** | Reused verbatim (D-08). |

### 3.2 `application/`

| File | Action | Detail |
|---|---|---|
| `ports/identidad-google-repository.port.ts` | Modify | `buscarPorId(userId): Promise<UsuarioVinculable \| null>` and `desvincularGoogleSub(userId): Promise<boolean>`. `UsuarioVinculable` **unchanged** — it already carries `{userId, esDemo, googleSub}`, which is exactly what both new consumers need. |
| `ports/user-credential-repository.port.ts` | Modify | `IdentidadUsuario` gains **required** `googleVinculado: boolean` (§1/Q5a). No new method. |
| `use-cases/iniciar-vinculacion-google.use-case.ts` (+ spec) | **New** | §4.1 |
| `use-cases/vincular-google.use-case.ts` (+ spec) | **New** | §4.2 |
| `use-cases/desvincular-google.use-case.ts` (+ spec) | **New** | §4.3 |
| `use-cases/login-con-google.use-case.ts` | **Unchanged** | Non-negotiable. A diff here means the login path was touched. |
| `use-cases/obtener-identidad.use-case.ts`, `actualizar-perfil.use-case.ts` | **Unchanged** | Both pass `IdentidadUsuario` through whole; the new field rides along with zero code change. |

### 3.3 `infrastructure/`

| File | Action | Detail |
|---|---|---|
| `http/auth/link-intent.ts` (+ spec) | **New** | §1/Q1b–c. Plain functions, constant-time, fail-closed. |
| `http/auth/oauth-transient-cookie.ts` (+ spec) | Modify | `OauthTransientState` gains `readonly link?: LinkIntent`; `isOauthTransientState` accepts both shapes and rejects a malformed `link` by returning `undefined` for the **whole** cookie. Docblock: the "unsigned by design" paragraph is amended in place to say the `link` field is the exception and why. |
| `persistence/prisma-identidad-google.repository.ts` (+ spec) | Modify | `buscarPorId` (`findUnique where {id}`, same `select`, same private mapper) and `desvincularGoogleSub` (the conditional `updateMany`, §1/Q4). **No `try/catch` on the unlink** — it touches no unique column. |
| `persistence/prisma-user-credential.repository.ts` (+ spec) | Modify | `googleSub: true` added to **both** `buscarIdentidad`'s and `actualizarPerfil`'s `select`; the shared `aIdentidadUsuario` maps the boolean. |
| `http-express/routes/perfil-google.routes.ts` (+ spec) | **New** | Three registrars (§1/Q2b). `.safeParse()` at the boundary; never echoes body or Zod issues. |
| `http-express/routes/auth-google.routes.ts` (+ spec) | Modify | Link-intent verification after the `state` check; the two tails extracted to `completarLogin` / `completarVinculacion`; two new redirect constants; `AuthGoogleDeps` gains `vincularGoogle` + `linkIntentKey`. |
| `http-express/routes/perfil-http-error.ts` (+ spec) | Modify | Union widened to `… \| IniciarVinculacionGoogleError \| DesvincularGoogleError`; three new branches; the `never` guard unchanged. |
| `http-express/routes/auth.routes.ts` (+ spec), `perfil.routes.ts` (+ spec) | Modify | `googleVinculado` added to the two identity payloads (both build the JSON inline). |
| `http-express/schemas/perfil-google.schema.ts` (+ spec) | **New** | §5.4 |
| `http-express/schemas/auth-me.schema.ts` (+ spec) | Modify | `googleVinculado: z.boolean()`. |
| `http-express/schemas/openapi-document.ts` (+ spec) | Modify | Two operations + two paths, append-only (§5.5). |
| `http-express/app.ts` (+ `app.auth.spec.ts`) | Modify | The three-way mount of §1/Q2b, immediately after `registrarPerfil`. |

### 3.4 `composition/`

| File | Action | Detail |
|---|---|---|
| `derive-blind-index-key.ts` (+ spec) | Modify | `deriveLinkIntentKey` + `LINK_INTENT_HKDF_INFO` (§1/Q1a). Docblock rewritten to cover both derivations. |
| `crear-auth-google.ts` (+ spec) | Modify | Gains `crypto` and `linkIntentKey` parameters; builds `IniciarVinculacionGoogleUseCase` + `VincularGoogleUseCase`; `GoogleAuthGraph` gains both. |
| `crear-perfil.ts` (+ spec) | Modify | Builds `new PrismaIdentidadGoogleRepository(prisma, blindIndex)` and `DesvincularGoogleUseCase`; `PerfilGraph` gains `desvincularGoogle`. |
| `container.ts` | Modify | `const linkIntentKey = deriveLinkIntentKey(encryptionKey);` next to the existing `blindIndex` derivation, threaded into `crearAuthGoogle` and (as a `Container` field) into `app.ts` for `AuthGoogleDeps`. |

**GUARD, non-negotiable and stated three times on purpose**: `crearAuthGoogle` and `crearPerfil`
**never** call `deriveBlindIndexKey` or `deriveLinkIntentKey`, and never `new` an `AesGcmCryptoService`
or `HmacBlindIndexService`. They receive the instances the composition root built **once**. A second
derivation is the exact hazard class of the 2026-08-02 production incident.

### 3.5 Generated / contract

| Artifact | Action |
|---|---|
| `apps/api/openapi.json` | Regenerated (`pnpm api openapi:emit`) |
| `packages/api-client/src/types.gen.ts` | Regenerated (`pnpm --filter @moneydiary/api-client generate`) |

### 3.6 Confirmed untouched

- **`apps/api/prisma/schema.prisma` + migrations** — `googleSub String? @unique` and
  `passwordHash String?` already exist. **No migration. One in the diff means the change went
  off-design.**
- **`apps/web/**` and `apps/mobile/**` *source*** — US-042 owns the UI. **Only the five test-fixture
  files of §1/Q5a change.**
- **`LoginConGoogleUseCase`, `LoginUseCase`, `LogoutUseCase`, `CrearDemoUseCase`,
  `crear-auth-google-mobile.ts`, `OpenIdClientGoogleAdapter`, `IVerificadorIdentidadExterna`,
  `IIniciadorLoginExterno`** — zero changes.
- **`perfil.routes.ts`'s two existing handlers** — only the `/auth/me`-shaped response literal gains a
  field.

---

## 4. The three flows, end to end

### 4.1 `POST /api/perfil/google/vincular` — initiation

**Use case** (`kiss` guard clauses, `Result.fail` first):

```
1. esDemo                              ⇒ PerfilDemoSoloLecturaError          (403 DEMO_SOLO_LECTURA)
2. creds.buscarCredencialPorId → null  ⇒ PerfilRechazadoError                (403 PERFIL_RECHAZADO)
3. hasher.verificar(passwordActual) false ⇒ PerfilRechazadoError             (403)
4. identidades.buscarPorId → googleSub !== null ⇒ GoogleYaVinculadoError     (409 GOOGLE_YA_VINCULADO)
5. iniciador.iniciar()  fail           ⇒ VinculacionGoogleNoDisponibleError  (503)
6. Result.ok(InicioAutorizacion)   // { urlAutorizacion, state, nonce, codeVerifier }
```

Steps 2–3 before step 4 on purpose (§P1): the `409` discloses account state, so it sits behind the
password. Step 4 returning `null` (row vanished) also maps to `PerfilRechazadoError` — a caller whose
own row does not exist gets the generic answer.

**The route** owns everything the use case must not know:

```ts
const inicio = result.getValue();
const link = firmarLinkIntent(linkIntentKey, inicio.state, req.userId!);
res.setHeader(
  'Set-Cookie',
  serializeOauthCookie(
    { state: inicio.state, nonce: inicio.nonce, codeVerifier: inicio.codeVerifier, link },
    cookieSecure,
  ),
);
res.status(200).json({ urlAutorizacion: inicio.urlAutorizacion });
```

Guarantees:

| # | Guarantee | Enforced by |
|---|---|---|
| G1 | A signed intent can only exist after a valid session + non-demo + correct password | The use case returns `Result.fail` before step 6 on every other branch; the route signs only on `ok` |
| G2 | The MAC is bound to *this* flow | It is computed over the `state` the same `iniciar()` call produced |
| G3 | The application layer cannot see or fabricate a MAC | `firmarLinkIntent` is imported only by the route; the use case's return type has no MAC field (D-01) |
| G4 | The signed `userId` is the session's, never the body's | `req.userId!`; the Zod schema is `.strict()` and has no id field |
| G5 | No new cookie surface | `serializeOauthCookie` unchanged — same name, `Path`, `Max-Age`, `HttpOnly`, `SameSite=Lax`, `Secure` |
| G6 | `urlAutorizacion` is never derived from request input | Produced by `openid-client` against the discovered issuer, from the configured `redirect_uri` (ADR-034 design §7) — not an open-redirect vector |

### 4.2 `GET /api/auth/google/callback` — the branch

```
   [unchanged] clear md_oauth  →  Sec-Fetch guard  →  rate limiter
   [unchanged] parse md_oauth  →  state === query.state ?  no ⇒ generic 302
   [NEW]  link present?
            no  → login mode (unchanged from here on)
            yes → verificarLinkIntent(key, oauthCookie.state, link)
                    false ⇒ .warn + generic 302 /login?error=google   ← ZERO writes, no Google call
                    true  ⇒ link mode
   [unchanged] verificador.verificar(...)   →  fail ⇒ generic 302 (mode-appropriate)
   branch:
     login mode → loginConGoogle.execute(identidad)         → completarLogin
     link  mode → vincularGoogle.execute({ userId, sub })   → completarVinculacion
```

`VincularGoogleUseCase.execute({ userId, sub })`:

```
1. identidades.buscarPorId(userId)
     null      ⇒ VinculacionGoogleFallidaError('usuario-inexistente')
     esDemo    ⇒ VinculacionGoogleFallidaError('usuario-demo')          // read-derived gate, D-05
2. estado.googleSub === sub ⇒ Result.ok()   // IDEMPOTENT — the desired end state already holds
3. estado.googleSub !== null ⇒ VinculacionGoogleFallidaError('ya-tiene-otro-sub')
                                            // switching accounts = unlink first, two audited transitions
4. identidades.buscarPorGoogleSub(sub) !== null
     ⇒ ★ VinculacionGoogleFallidaError('identidad-de-otra-cuenta')
     // after step 2 this can ONLY be another account's identity. NEVER re-link.
5. identidades.vincularGoogleSub(userId, sub)   // existing conditional updateMany, reused VERBATIM
     false ⇒ VinculacionGoogleFallidaError('link-perdio-la-carrera')
6. Result.ok()
```

- **Step 4 is the ★ rule's explicit, testable home**; `googleSub @unique` is its second,
  unconditional line of defence, and `vincularGoogleSub`'s `P2002` catch turns that collision into
  `false` → step 5's failure. Two independent barriers, both exercised (§6.3).
- **`vincularGoogleSub` is reused verbatim** — `WHERE id = ? AND googleSub IS NULL` is already exactly
  right for a caller that knows its own `userId`.
- **No session is issued** (§1/Q2c). `completarVinculacion` sets only the `md_oauth` clearing header
  and redirects.
- **CA-05 is structural**: the input has two fields, neither of which can hold a token; the route
  destructures `verificacion.getValue().sub` explicitly and passes nothing else.

### 4.3 `POST /api/perfil/google/desvincular` — unlink

```
1. esDemo                                    ⇒ PerfilDemoSoloLecturaError    (403 DEMO_SOLO_LECTURA)
2. creds.buscarCredencialPorId → null        ⇒ VinculoRequierePasswordError  (403 VINCULO_REQUIERE_PASSWORD)
3. hasher.verificar(passwordActual) false    ⇒ PerfilRechazadoError          (403 PERFIL_RECHAZADO)
4. identidades.desvincularGoogleSub(userId)  ⇒ 204 for true AND for false    (§1/Q4)
```

Guarantees:

| # | Guarantee | Enforced by |
|---|---|---|
| G7 | An account is never left without an access method | `WHERE … passwordHash IS NOT NULL` — one statement, no window (§1/Q4) |
| G8 | The refusal message is actionable without leaking anything | Step 2 speaks only about the caller's own credentials (§1/Q4) |
| G9 | A stolen session cannot strip the link | Step 3's password re-verification (binding decision 4) |
| G10 | Only the caller's own row is ever touched | `where: { id: userId }`, `userId` from `req.userId!` only; `.strict()` schema has no id field |
| G11 | Idempotent | `false` ⇒ `204`; the requested end state holds |

---

## 5. Contracts

### 5.1 Ports

```ts
// application/ports/identidad-google-repository.port.ts
export interface IIdentidadGoogleRepository {
  buscarPorGoogleSub(googleSub: string): Promise<UsuarioVinculable | null>;
  buscarPorEmail(email: Email): Promise<UsuarioVinculable | null>;
  vincularGoogleSub(userId: string, googleSub: string): Promise<boolean>;

  /** VINC041-03/04. Proyección por PK — el vínculo explícito conoce su propio
   *  `userId` (viene firmado) y no busca por email ni por sub. `esDemo` viaja
   *  en la proyección porque el callback NO tiene sesión: el gate demo se
   *  DERIVA de la fila, no de un input (design §2/D-05). */
  buscarPorId(userId: string): Promise<UsuarioVinculable | null>;

  /** VINC041-05. Ver design §1/Q4 — el invariante vive en el WHERE. */
  desvincularGoogleSub(userId: string): Promise<boolean>;
}
```

**ISP note, recorded rather than acted on**: `DesvincularGoogleUseCase` consumes one of five methods.
The port stays whole because it remains role-cohesive ("the Google identity of a user") and splitting
it would double the doubles. **Trigger: a third consumer needing a disjoint subset ⇒ split.**

`IUserCredentialRepository` gains **no method** — only the `IdentidadUsuario` field (§1/Q5a).

### 5.2 Use-case contracts *(CORRECTION: `VincularGoogleUseCase` has no `esDemo` input)*

```ts
export type IniciarVinculacionGoogleError =
  | PerfilDemoSoloLecturaError
  | PerfilRechazadoError
  | GoogleYaVinculadoError
  | VinculacionGoogleNoDisponibleError;

class IniciarVinculacionGoogleUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly iniciador: IIniciadorLoginExterno,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}
  execute(input: {
    userId: string;
    esDemo: boolean;          // REQUERIDO (D-05)
    passwordActual: string;
  }): Promise<Result<InicioAutorizacion, IniciarVinculacionGoogleError>>;
}

class VincularGoogleUseCase {
  constructor(
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly logger: ILogger,
  ) {}
  /** DOS campos, a propósito: no hay sesión en el callback, así que `esDemo`
   *  se DERIVA de la fila (D-05); y no hay ningún campo donde pudiera entrar
   *  un token de Google (CA-05, VINC041-08). */
  execute(input: {
    userId: string;
    sub: string;
  }): Promise<Result<void, VinculacionGoogleFallidaError>>;
}

export type DesvincularGoogleError =
  | PerfilDemoSoloLecturaError
  | VinculoRequierePasswordError
  | PerfilRechazadoError;

class DesvincularGoogleUseCase {
  constructor(
    private readonly creds: IUserCredentialRepository,
    private readonly identidades: IIdentidadGoogleRepository,
    private readonly hasher: IPasswordHasher,
    private readonly logger: ILogger,
  ) {}
  execute(input: {
    userId: string;
    esDemo: boolean;          // REQUERIDO (D-05)
    passwordActual: string;
  }): Promise<Result<void, DesvincularGoogleError>>;
}
```

`IniciarVinculacionGoogleUseCase` returns the **whole `InicioAutorizacion`** (including
`state`/`nonce`/`codeVerifier`), not just the URL: the cookie is transport, so the route assembles and
signs it (D-01). The use case never learns a MAC exists.

### 5.3 HTTP surface

| Route | Auth | Body | Success |
|---|---|---|---|
| `POST /api/perfil/google/vincular` | session + demo gate + password + **Google-on gate** | `{ passwordActual }` | `200 { urlAutorizacion }` + `Set-Cookie: md_oauth` |
| `POST /api/perfil/google/desvincular` | session + demo gate + password | `{ passwordActual }` | `204` |
| `GET /api/auth/google/callback` | none, by construction | — | `302`, mode-dependent (§4.2) |
| `GET /api/auth/me` · `PATCH /api/perfil` | session | — | `200 { userId, nombre, email, esDemo, googleVinculado }` |

`POST /api/perfil/google/desvincular` rather than `DELETE /api/perfil/google`: the request carries a
body (`passwordActual`), and a body on `DELETE` is legal-but-underspecified and unevenly handled by
intermediaries.

`aPerfilHttpError` — one class ⇒ one status ⇒ one code, `never` guard unchanged:

| Class | Status | Code |
|---|---|---|
| *(existing five)* | — | unchanged |
| `VinculoRequierePasswordError` | `403` | `VINCULO_REQUIERE_PASSWORD` |
| `GoogleYaVinculadoError` | `409` | `GOOGLE_YA_VINCULADO` |
| `VinculacionGoogleNoDisponibleError` | `503` | `GOOGLE_NO_DISPONIBLE` |
| *(route-level)* Zod `.safeParse` failure | `400` | `BODY_INVALIDO` — body and issues **never** echoed |
| *(route-level)* Google feature off | `404` | — (no body, AUTH-16 parity) |
| *(middleware only)* | `401` | — no use-case branch ever returns `401` |

The **callback** has no error body: every outcome is a `302` and every failure is the single generic
value (AUTH-15 parity).

### 5.4 Zod (`http-express/schemas/perfil-google.schema.ts`)

```ts
export const vincularGoogleRequestSchema = z
  .object({ passwordActual: z.string() })
  .strict();                       // VINC041-08: un `userId` extra ⇒ 400, nunca ignorado

export const desvincularGoogleRequestSchema = z
  .object({ passwordActual: z.string() })
  .strict();

export const vincularGoogleResponseSchema = z
  .object({ urlAutorizacion: z.string() })
  .meta({ id: 'VincularGoogleResponse', description: '…' });
```

**LAYER-HONESTY GATE** (file docblock, `categorias.schema.ts` / `perfil.schema.ts` precedent): no
`.min()` on `passwordActual` — the current password is *verified*, not *validated*; a length rule here
would be a business claim in the transport layer and would leak the password policy to an
unauthenticated shape check. **No `.url()` on `urlAutorizacion`** either: it is server-generated and a
format assertion on our own output is theatre.

**Two schemas with identical shape rather than one shared `passwordActualRequestSchema`**: they
document two different operations and will diverge the moment either grows a field. `dry` rule of
three — **trigger: a third `{ passwordActual }`-only body ⇒ extract.**

`perfilErrorResponseSchema` is **reused** for the error bodies (same `{message, code}` contract, same
`/api/perfil` family) — this is the third occurrence of that *shape* overall, which trips `dry`'s
rule-of-three trigger recorded by US-040. **Action item for the tasks phase**: extract a shared
`ErrorResponse` schema, or explicitly re-defer with a reason.

`authMeResponseSchema` gains `googleVinculado: z.boolean()`; its `meta.description` is updated to name
the new field and its meaning.

### 5.5 OpenAPI (`openapi-document.ts`) — append-only

Two new operation consts + two new `paths` entries, following the file's exact existing shape:

```ts
const perfilGoogleVincularOperation: ZodOpenApiOperationObject = {
  summary: 'Start linking a Google identity to the current account',
  description:
    'Authenticated endpoint (US-041, VINC041-01/02) that re-verifies the current password and starts '
    + 'the OIDC round trip that will bind a Google identity to the CALLER\'s own account — no email '
    + 'matching is involved. Responds with the authorization URL and sets the short-lived `md_oauth` '
    + 'cookie carrying an HMAC-signed link intent; the client performs a top-level navigation to that '
    + 'URL. Completion happens at GET /api/auth/google/callback, which redirects to '
    + '`/configuracion?google=vinculado` or `/configuracion?google=error` and issues NO new session. '
    + 'Rejected for demo sessions (403 DEMO_SOLO_LECTURA), for a wrong current password (403 '
    + 'PERFIL_RECHAZADO), and when the account already carries a Google identity (409 '
    + 'GOOGLE_YA_VINCULADO — unlink first). 404 when Google login is not active (AUTH-16).',
  requestBody: { content: { 'application/json': { schema: vincularGoogleRequestSchema } } },
  responses: {
    '200': { description: '…', content: { 'application/json': { schema: vincularGoogleResponseSchema } } },
    '400': { /* perfilErrorResponseSchema */ }, '403': { /* … */ }, '409': { /* … */ },
    '503': { /* … */ }, '401': { description: 'No valid session.' },
    '404': { description: 'Google login is not active (AUTH-16).' },
  },
};

const perfilGoogleDesvincularOperation: ZodOpenApiOperationObject = { /* 204 / 400 / 403 / 401 */ };

// paths (append):
'/api/perfil/google/vincular':    { post: perfilGoogleVincularOperation },
'/api/perfil/google/desvincular': { post: perfilGoogleDesvincularOperation },
```

`authGoogleCallbackOperation`'s **description** is amended (no response change) to document the dual
mode and both link redirect targets — that description is the cross-workspace source of the
`/configuracion?google=…` contract US-042 reads (§P3). `authMeOperation` needs **no edit** — it already
`$ref`s `authMeResponseSchema`.

**Additivity**: two new paths, one new required response field, one amended description. Nothing is
narrowed or removed.

### 5.6 Regeneration commands (in order)

```bash
pnpm api openapi:emit                            # rewrites apps/api/openapi.json
pnpm --filter @moneydiary/api-client generate    # rewrites packages/api-client/src/types.gen.ts
pnpm api openapi:check                           # drift gate, must be green
pnpm --filter @moneydiary/api-client typecheck
```

Both artifacts are CI drift-gated and must be committed **with** the code. An `openapi.json`
advertising the link endpoints after a revert would point US-042's generated client at a `404` —
exactly what the gate exists to prevent.

---

## 6. Testing strategy (strict TDD)

Order per slice: **red unit → green → red integration → green**. Runners: `pnpm api test` (Vitest,
Oxc, no DB); `pnpm api test:integration` / `test:e2e` (real ephemeral Postgres,
`ALLOW_DESTRUCTIVE_DB=1`, wired in CI per ADR-029).

### 6.1 Existing tests affected — all named, none discovered mid-implementation

| # | File | Why it breaks | Becomes |
|---|---|---|---|
| 1 | `test/support/identidad-google-repository.double.ts` | port gains two methods (compile error) | add `buscarPorId` + `desvincularGoogleSub` `vi.fn()`s and two `overrides` keys. **The only double of this port in the repo** — verified |
| 2 | `application/ports/identidad-google-repository.port.spec.ts` | pins the port shape | two new cases: `buscarPorId` resolves a `UsuarioVinculable` or `null`; `desvincularGoogleSub` resolves a boolean |
| 3 | `application/use-cases/login-con-google.use-case.spec.ts` | uses the shared double | no assertion changes — the double update is enough. **A changed `expect(...)` here is a review red flag** |
| 4 | `application/use-cases/obtener-identidad.use-case.spec.ts` | `IdentidadUsuario` gains a required field | add `googleVinculado` to fixtures; assert it passes through untouched |
| 5 | `infrastructure/persistence/prisma-user-credential.repository.spec.ts` | fixtures + `select` change | assert `googleSub` is in **both** selects and that the mapper emits the boolean, never the raw value |
| 6 | `infrastructure/persistence/prisma-identidad-google.repository.spec.ts` | two new methods | new `describe`s (§6.2) |
| 7 | `infrastructure/http-express/routes/auth.routes.spec.ts`, `perfil.routes.spec.ts`, `app.auth.spec.ts` | identity payload | assert `googleVinculado` in the `200` bodies |
| 8 | `infrastructure/http-express/schemas/auth-me.schema.spec.ts` | schema gains a required field | fixtures gain the field; add a case asserting a body **without** it is rejected |
| 9 | `infrastructure/http-express/schemas/openapi-document.spec.ts` | new paths/operations | extend the path/operation inventory |
| 10 | `infrastructure/http-express/routes/auth-google.routes.spec.ts` | `AuthGoogleDeps` gains two fields | deps literals grow; **existing login scenarios keep their exact assertions** |
| 11 | `composition/crear-auth-google.spec.ts` | signature + graph shape | assert the two new use cases are built and that **no key derivation happens inside** |
| 12 | `test/perfil-crud.int-spec.ts`, `test/perfil-demo-gate.int-spec.ts`, `test/auth-isolation.int-spec.ts`, `test/auth-login.e2e-spec.ts`, `test/catalogo-demo-gate.int-spec.ts` | **not modified** | regression guards. A diff to any of them is a review red flag |

**CORRECTION to the proposal's "the existing callback integration spec must pass unchanged".** That
claim is too strong and would be discovered as false at implementation time:
`test/auth-google-callback.int-spec.ts` builds its **own** `GoogleAuthGraph` literal, so it stops
compiling the moment the graph gains two required fields. The reviewable invariant is the precise one:

> **No scenario, no `expect(...)`, no expected status, redirect target, or DB assertion changes in
> `auth-google-callback.int-spec.ts`. Only its deps/graph literals grow.** A diff touching an
> assertion in that file means the login path changed and the change went off-design.

Same for `auth-google.routes.spec.ts`.

### 6.2 New unit coverage — target file → assertions

| Target | Assertions |
|---|---|
| `composition/derive-blind-index-key.spec.ts` | **The purpose-separation proof**: for a fixed `k`, `deriveLinkIntentKey(k)` ≠ `deriveBlindIndexKey(k)`; each is 32 bytes; each is deterministic; `LINK_INTENT_HKDF_INFO !== BLIND_INDEX_HKDF_INFO` |
| `infrastructure/http/auth/link-intent.spec.ts` | Determinism (same key+state+userId ⇒ same MAC); **a different `state` ⇒ a different MAC**; a different `userId` ⇒ a different MAC; a different **key** ⇒ a different MAC; **the canonicalization case**: `firmar(k,'a.b','c').mac !== firmar(k,'a','b.c').mac` (§1/Q1b); `verificar` ⇒ `false` (never a throw) for: a wrong-length MAC, an empty MAC, non-base64url garbage, a MAC from a different `state`, a MAC from a different `userId`, a MAC from a different key |
| `infrastructure/http/auth/oauth-transient-cookie.spec.ts` | Round-trip **with** and **without** `link`; a cookie without `link` serializes to **exactly the same bytes as before this change** (pin against a literal captured from the current implementation); a malformed `link` (not an object / missing `mac` / `mac` not a string / `link: null`) ⇒ the **whole** parse is `undefined`; the `Set-Cookie` attributes are unchanged (`Path=/api/auth/google`, `Max-Age=600`, `HttpOnly`, `SameSite=Lax`) |
| `application/use-cases/iniciar-vinculacion-google.use-case.spec.ts` | demo ⇒ error **and no repository, hasher or `iniciador` call**; credential `null` ⇒ `PerfilRechazadoError` **and `iniciador` never called**; wrong password ⇒ `PerfilRechazadoError` **and `buscarPorId` never called** (proves the ordering of §P1); `googleSub` already set ⇒ `GoogleYaVinculadoError` **and `iniciador` never called**; `iniciar()` fails ⇒ `VinculacionGoogleNoDisponibleError`; happy path returns the `InicioAutorizacion` **verbatim**; **no log context ever carries a password, an email or a `googleSub` value** |
| `application/use-cases/vincular-google.use-case.spec.ts` | fresh link ⇒ `vincularGoogleSub(userId, sub)` called once with exactly those args; **idempotent**: same `sub` already on the row ⇒ `ok` **and `vincularGoogleSub` never called**; a *different* `sub` on the row ⇒ fail, no write; **★ binding proof**: `buscarPorGoogleSub` returns another user ⇒ fail **and `vincularGoogleSub` NEVER called**; `esDemo` row ⇒ fail, no write (**read-derived gate**, D-05); row `null` ⇒ fail; `vincularGoogleSub` `false` ⇒ fail; **CA-05**: `Object.keys(input)` deep-equals `['userId','sub']` |
| `application/use-cases/desvincular-google.use-case.spec.ts` | demo ⇒ error, **`desvincularGoogleSub` never called**; credential `null` ⇒ `VinculoRequierePasswordError`, **write never called** (binding proof (b)); wrong password ⇒ `PerfilRechazadoError`, **write never called**; `true` ⇒ `ok`; **`false` ⇒ `ok`** (idempotent) |
| `infrastructure/persistence/prisma-identidad-google.repository.spec.ts` | `buscarPorId`: `where` deep-equals `{ id: userId }`, same `select`, `null` when absent; **`desvincularGoogleSub`: the `updateMany` argument deep-equals `{ where: { id, passwordHash: { not: null }, googleSub: { not: null } }, data: { googleSub: null } }`** — this literal IS the CA-03 invariant, and a spec that only asserts `count === 1` would pass against a predicate-less update; `count === 0` ⇒ `false`; **no `try/catch` swallows a Prisma error** (an arbitrary rejection propagates) |
| `infrastructure/http-express/routes/perfil-google.routes.spec.ts` | `200 { urlAutorizacion }` + a `Set-Cookie` header whose decoded payload carries a `link` with a **verifiable** MAC (verify it in the spec with the same key); each use-case error → its exact `(status, code)`; `400 BODY_INVALIDO` for `{}` and for `{ passwordActual, userId: 'otro' }` (`.strict()`); `esDemo`/`userId` are threaded from `req`, never from the body; **`registrarPerfilGoogleVincularDeshabilitado` ⇒ `404` with no body**; `204` with no body on unlink |
| `infrastructure/http-express/routes/perfil-http-error.spec.ts` | the three new classes map to `(403, VINCULO_REQUIERE_PASSWORD)`, `(409, GOOGLE_YA_VINCULADO)`, `(503, GOOGLE_NO_DISPONIBLE)`; the `403 PERFIL_RECHAZADO` body is **byte-identical** whichever endpoint produced it |
| `infrastructure/http-express/routes/auth-google.routes.spec.ts` (new cases) | no `link` ⇒ `loginConGoogle` called, `vincularGoogle` **not**; valid `link` ⇒ `vincularGoogle` called with `{userId, sub}`, `loginConGoogle` **not**, **no `Set-Cookie` carrying `md_session`**, redirect `/configuracion?google=vinculado`; use-case failure ⇒ `/configuracion?google=error`; **invalid `link` ⇒ `/login?error=google`, `verificador.verificar` NEVER called, both use cases never called** (binding proof (a) at the unit level) |

### 6.3 The four binding proofs, named

| # | Proof | Where |
|---|---|---|
| **(a)** | A tampered, cross-flow or absent MAC **writes nothing and logs nobody in** | Unit: `auth-google.routes.spec.ts` (above). **Integration `test/vinculacion-google.int-spec.ts`**: three requests — `link.userId` swapped to another user; a `mac` computed over a *different* `state`; `link` present with `mac: ''` — each ⇒ `302 /login?error=google`, **no `md_session` cookie**, and **both users' rows byte-identical** (compare full row snapshots taken before and after, not just `googleSub`) |
| **(b)** | Unlink is refused for a password-less user with **nothing changed** | Integration: seed a user directly with `passwordHash: null` and a `googleSub`; unlink ⇒ `403 VINCULO_REQUIERE_PASSWORD` and `googleSub` unchanged. Plus the repository spec pinning the `WHERE` (§6.2) — the two together cover both the message and the invariant |
| **(c)** | The ★ rule holds on the **link** path | Unit (`vincularGoogleSub` never called) **and** integration: user B owns `sub-X`; user A runs a link flow that returns `sub-X` ⇒ `302 /configuracion?google=error`, **A's `googleSub` still `null`, B's row byte-identical** |
| **(d)** | The OIDC provider is faked, never live | `verificador: { verificar: vi.fn() }` against a **real Postgres**, exactly as `auth-google-callback.int-spec.ts` already does — including its self-provisioning of `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` in `beforeAll` and their restoration in `afterAll` (CI's integration job sets none). `iniciador` is a stub returning a fixed `InicioAutorizacion`, so leg 1 never touches the network either |

### 6.4 Integration (real DB) — `test/vinculacion-google.int-spec.ts` (new)

Scaffolded from `auth-google-callback.int-spec.ts` (own graph, per-run ids, full `afterAll` teardown)
plus `test/support/session.fixture.ts` for the authenticated pre-condition.

| Requirement | Case |
|---|---|
| VINC041-01 | authenticated non-demo user + correct password ⇒ `200 { urlAutorizacion }`; the raw `Set-Cookie` header is asserted to contain `md_oauth=`, **`Path=/api/auth/google`**, `HttpOnly`, `SameSite=Lax`, `Max-Age=600` (§1/Q3's RFC claim, pinned) |
| VINC041-01 | wrong `passwordActual` ⇒ `403 PERFIL_RECHAZADO`, **no `Set-Cookie` at all**, row unchanged |
| VINC041-02 | the three forged-intent cases of proof (a) |
| VINC041-03 | full happy path: initiate → replay the returned cookie into the callback with a faked verificador ⇒ `302 /configuracion?google=vinculado`, `googleSub` written on **the caller's** row, and **no `Session` row created** (`prisma.session.count` before === after) |
| VINC041-04 | proof (c) |
| VINC041-04 | idempotent re-link of the same `sub` ⇒ `302 …vinculado`, row unchanged |
| VINC041-05 | proof (b); plus happy unlink ⇒ `204` and `googleSub === null`; plus a second unlink ⇒ `204` (idempotent) |
| VINC041-06 | `GET /api/auth/me` reports `googleVinculado: false` before and `true` after the link, and `false` after the unlink |
| VINC041-07 | a demo session on **both** endpoints ⇒ `403 DEMO_SOLO_LECTURA`, nothing written (extend `test/perfil-demo-gate.int-spec.ts` rather than duplicating its scaffolding) |
| VINC041-08 | `test/auth-isolation.int-spec.ts` (extended): A sends either body with a field naming B ⇒ `400` (`.strict()`) and **B's row byte-identical** |
| AUTH-16 parity | a container built **without** `GOOGLE_CLIENT_ID` ⇒ `POST /api/perfil/google/vincular` is `404`, and `POST /api/perfil/google/desvincular` still **works** (§1/Q2b) — this is the case the proposal would have shipped as a `500` |

### 6.5 Login regression

`test/auth-google-callback.int-spec.ts` runs with **every existing assertion unchanged** (§6.1). That
is the proof that a cookie without `link` behaves byte-identically. Combined with the
`oauth-transient-cookie.spec.ts` byte-pin, the login path is covered from both the serialization and
the behavioural end.

### 6.6 Full green bar

```bash
pnpm api test
pnpm api exec tsc --noEmit
ALLOW_DESTRUCTIVE_DB=1 pnpm api test:integration
ALLOW_DESTRUCTIVE_DB=1 pnpm api test:e2e
pnpm api openapi:check
pnpm --filter @moneydiary/api-client typecheck
pnpm web typecheck                                  # MANDATORY — §1/Q5a
pnpm --filter @moneydiary/mobile exec tsc --noEmit  # MANDATORY — §1/Q5a
pnpm web test                                       # no-regression
```

---

## 7. Delivery constraints for the tasks phase

**Three chained PRs — CORRECTION to the proposal's two.**

The proposal's own argument for splitting ("different risk profiles; reviewing them together would
bury one under the other") applies a third time, to a slice it folded into PR #1: the required DTO
field is the **only** part of this change that crosses into `apps/web` and `apps/mobile`, that breaks
five fixture files, and that is gated by two commands nobody runs locally. Reviewing that alongside a
new cryptographic mechanism buries exactly the thing the proposal marks **High** likelihood.

| PR | Content | Stands alone because |
|----|---------|----------------------|
| **#1 — Link state on the identity read** | `IdentidadUsuario.googleVinculado`; `googleSub` in both `select`s + the shared mapper; `authMeResponseSchema`; the `/auth/me` and `PATCH /api/perfil` payloads; contract regen; **the five client fixtures**; the affected API fixtures | Ships **VINC041-06 / CA-04** end to end and unblocks US-042's *read-only* rendering immediately. Smallest, lowest-risk, and it takes the cross-workspace churn out of the crypto review |
| **#2 — Link** | `deriveLinkIntentKey`; `link-intent.ts`; the `md_oauth` payload extension; `IniciarVinculacionGoogleUseCase` + `POST /api/perfil/google/vincular` + the activation gate; callback branching; `VincularGoogleUseCase` + `buscarPorId`; the three new link errors; contract regen; the §6.3 (a)/(c)/(d) proofs | Ships CA-01/02/05. The security mechanism gets a review of its own, **with the forged-cookie proof in front of the reviewer** |
| **#3 — Unlink** | `desvincularGoogleSub`; `DesvincularGoogleUseCase`; `POST /api/perfil/google/desvincular`; `VinculoRequierePasswordError` + the translator branch; the §6.3 (b) proof; the ADR-034 amendment | Ships CA-03. Depends on #2 only for the route file and translator it extends |

**Size forecast** (refined from the file map; `sdd-tasks` owns the binding one):

| Bucket | Rough changed lines |
|---|---|
| PR #1 source + fixtures (≈14 files) | ~180 |
| PR #1 generated | ~40 |
| PR #2 source (≈14 files, 8 new) | ~430 |
| PR #2 specs (≈8 files, 4 new incl. the int-spec) | ~450 |
| PR #2 generated | ~90 |
| PR #3 source (≈8 files, 3 new) | ~180 |
| PR #3 specs (≈5 files) | ~220 |

⇒ **PR #1 fits the 400-line budget. PR #2 and PR #3 exceed it; `size:exception` is the expected and
correct outcome for both**, and should be recorded up front rather than discovered at PR time. The
bulk of #2 is test churn plus the integration spec that carries the headline security proof — the
safest lines in the diff and the ones the change's headline risk depends on. Splitting #2 further
(e.g. "signer + cookie" then "use cases + routes") would produce a slice that ships nothing
independently valuable and would double the contract regeneration.

**Sequencing note**: `/configuracion` does not exist in `apps/web` yet (verified). PR #2's link
redirect is therefore unreachable until US-042 ships its route — acceptable, because no client can
start a link flow before then, but it means **the flow must not be announced to users until US-042 is
live**.

**Non-negotiables handed to `sdd-apply`:**

- **No Prisma migration.** One in the diff means the change went off-design.
- **Zero *source* files changed under `apps/web/` or `apps/mobile/`** — five test fixtures only.
- `deriveLinkIntentKey` uses an `info` **different** from `BLIND_INDEX_HKDF_INFO`, and the spec that
  asserts the two derived keys differ ships with it.
- The MAC message is **length-prefixed**, not `${state}.${userId}` (§1/Q1b).
- `verificarLinkIntent` checks length **before** `timingSafeEqual` and never throws.
- An invalid `link` ⇒ **reject the whole callback** with `/login?error=google`. Never fall through to
  login. Never redirect to `/configuracion` on an unverified marker.
- The MAC is verified **after** the `state` check and **before** `verificador.verificar()`.
- `VincularGoogleUseCase.execute` takes **exactly** `{ userId, sub }`. No `esDemo` input — it is read
  from the row (D-05). No optional gate, ever.
- `esDemo` stays a **required** input on the other two use cases.
- `desvincularGoogleSub`'s `WHERE` carries **both** `passwordHash: { not: null }` and
  `googleSub: { not: null }`. A read-then-write voids §1/Q4 entirely.
- `vincularGoogleSub` is reused **verbatim** — not copied, not re-implemented.
- `crearAuthGoogle` / `crearPerfil` **never** derive a key and never `new` a crypto service.
- `login-con-google.use-case.ts` is **not modified**.
- No `.min()`/`.url()` in the new Zod schemas (§5.4 layer-honesty gate).
- No log line ever carries a `googleSub`, a MAC, a password, a token, or the unverified `userId` of a
  rejected link intent (D-09).
- `openapi.json` + `types.gen.ts` committed **with** the code, never in a follow-up.

**Open action items for the tasks phase:**

1. **Issue #275's CA-01 and CA-03 are stale** — both now require the current password (binding
   decisions 2 and 4), and the issue does not mention the demo gate. Update it, or verification checks
   against wording nobody updated.
2. **Open a debt issue: typecheck `apps/mobile/test/`** (§1/Q5b), referencing the US-040 `nombre` drift
   as the evidence.
3. **Decide the shared `ErrorResponse` schema** (§5.4) — extract now, or re-defer with a reason.
   Third occurrence reached.

---

## 8. Residual risks

| Risk | Status / mitigation |
|---|---|
| **A forged link-intent grants an attacker a permanent access method on a victim's account** | The headline risk and the headline test. HMAC over a length-prefixed `(state, userId)` with a purpose-separated key, constant-time compare, reject-never-fall-back, MAC checked before any Google call, and binding proof (a) asserting **zero writes** on tampered/cross-flow/absent MACs (§1/Q1, §6.3) |
| **Key reuse** — the link key derived with the blind-index `info` | Distinct exported `info`, both derivations in one file under one docblock, and a spec asserting the two keys **differ for the same `ENCRYPTION_KEY`** (D-02). Note the type system cannot help: both are 32-byte `Buffer`s |
| **`md_oauth` cookie *theft* (not forgery) lets an attacker link their Google account to the victim** | **Not defended, by design, and stated plainly** (§1/Q1d). Reading an `HttpOnly`+`Secure`+`Path`-scoped cookie requires the same capability that already yields `md_session`, so this adds no new exposure. Bounded by the 10-minute lifetime and by clearing on every callback exit |
| **Cookie shadowing** — a sibling host sets a `Domain=`-scoped `md_oauth` the browser prefers | The MAC makes the content unforgeable, so the worst outcome is a failed flow, not a wrong link. Recorded, not engineered against |
| **An account ends up with no access method** | The invariant lives in a single `WHERE` clause, not an application pre-check (§1/Q4), pinned by a repository spec that asserts the **exact `updateMany` argument** — a spec asserting only `count === 1` would pass against a predicate-less update |
| **Client typecheck breaks on the required DTO field**, discovered in CI rather than locally | **High likelihood, low impact.** Five files named exactly (§1/Q5a — two more than the proposal listed), both typecheck commands mandatory (§6.6), and the slice isolated into its own PR (§7) |
| **`apps/mobile/test/` silently drifts again** | Fixture fixed here; the tsconfig widening is a named debt item, not a silent omission (§1/Q5b) |
| **`POST /api/perfil/google/vincular` `500`s where Google is not configured** | Would have shipped from the proposal as written. Resolved by the split activation gate (§1/Q2b) and pinned by an AUTH-16-parity integration case (§6.4) |
| **Login regression from callback branching** | The login tail is a pure move; `auth-google-callback.int-spec.ts` keeps **every assertion** (only its deps literals grow, §6.1); `oauth-transient-cookie.spec.ts` byte-pins a `link`-less cookie |
| **The redirect contract with US-042 drifts** (`/configuracion?google=…`) | Two constants in one file, written into the spec and into the callback's OpenAPI description — the only representation `apps/web` can read across the ADR-008 boundary. `/configuracion` does not exist yet: the flow must not be announced before US-042 ships (§7) |
| **The `409` pre-flight is mistaken for a security control** | Stated as UX in the error docblock, the OpenAPI description and §P1. The real control is step 3 of `VincularGoogleUseCase`; the `@unique` index is the unconditional backstop |
| **Password-guessing oracle on the two new endpoints** | Both sit behind `x-api-key` **and** a valid session, so only someone who already holds the account's session can reach them. Deferred with US-040's exact trigger and mitigation shape (`demoRateLimiter`) |
| **`IIdentidadGoogleRepository` is now a 5-method port with a 1-method consumer** (ISP) | Accepted — the port stays role-cohesive and splitting it doubles the doubles. **Trigger recorded**: a third consumer needing a disjoint subset ⇒ split (§5.1) |
| **Contract drift** | Existing CI gates (`openapi:check`, api-client job), VINC041-09 |
| **Scope creep into the Configuración UI** | Explicit non-goal, stated in the proposal, §3.6 and §7. Zero `apps/web`/`apps/mobile` source files |

---

## 9. Design element → requirement mapping (for `sdd-spec` and `sdd-verify`)

| Requirement | Owned by |
|---|---|
| VINC041-01 | `IniciarVinculacionGoogleUseCase` steps 1–4; `registrarPerfilGoogleVincular`; `vincularGoogleRequestSchema` (`.strict()`) |
| VINC041-02 | `deriveLinkIntentKey` + `LINK_INTENT_HKDF_INFO`; `link-intent.ts`; `parseOauthCookie`'s widened shape validator; the callback's verify-then-reject branch |
| VINC041-03 | The callback branch + `completarVinculacion`; the two redirect constants; "no session issued" |
| VINC041-04 | `VincularGoogleUseCase` steps 2–5; `vincularGoogleSub`'s conditional `updateMany`; `googleSub @unique` |
| VINC041-05 | `desvincularGoogleSub`'s `WHERE`; `DesvincularGoogleUseCase` steps 1–4; `VinculoRequierePasswordError` |
| VINC041-06 | `IdentidadUsuario.googleVinculado`; both `select`s; `aIdentidadUsuario`; `authMeResponseSchema` |
| VINC041-07 | `PerfilDemoSoloLecturaError` + required `esDemo` on two use cases + the read-derived gate on the third (D-05) |
| VINC041-08 | `VincularGoogleUseCase`'s two-field input; `.strict()` schemas; `req.userId!` only; `where: { id: userId }` everywhere |
| VINC041-09 | `openapi-document.ts` + `openapi:check` + the api-client `generate`/`typecheck` gates |
| AUTH-09 (delta) | `googleVinculado` on the identity payload |
| AUTH-12 (delta) | The dual-mode callback |
| AUTH-14 (delta) | `email_verified` scoped to email-matched linking (§1/Q6b) |
