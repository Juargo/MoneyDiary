# Design — auth-google-login-mobile

**Inputs:** `proposal.md` (locked product decisions Q1–Q5), `docs/adr/ADR-035-login-google-mobile-token-exchange.md` (the decision), `docs/adr/ADR-034-login-con-google-oidc.md` (the web flow being extended), the archived web design (`openspec/changes/archive/2026-08-08-auth-google-login/design.md`), and the live code in `apps/api` / `apps/mobile`.

**This document owns proposal risks 1–10.** It does not reopen any locked product decision (Android only, capability-gated button, sign-in only, runbook-in-scope, no server-side `nonce`).

**Reading order:** §1 is the shape. §2–§10 are the decisions — each states the choice, the evidence, the rejected alternatives and the residual risk. §11 is testing, §12 rollout + runbook, §13 the delivery slices, §14 what still needs the user.

**Two corrections to the proposal, both verified against live code this session:**

1. **Integration and e2e tests DO run in CI.** Proposal risk 8 assumes `test:integration` is local-only. `.github/workflows/ci.yml` has an `integration` job with a `postgres:16-alpine` service container, `ALLOW_DESTRUCTIVE_DB=1`, `pnpm api test:db:setup`, then `pnpm api test:integration` **and** `pnpm api test:e2e`. DB-backed tests are a blocking pre-merge gate. Plan accordingly.
2. **`authCapabilitiesResponseSchema` is not `.strict()`.** It is a plain `z.object({...}).meta({...})`. The real coupling that forces schema, route, OpenAPI and tests to move together is (a) the route's `const body: AuthCapabilitiesResponse = {...}` type annotation — adding a field to the schema is a compile error until the route supplies it — and (b) `pnpm api openapi:check` in CI. That coupling is real and sufficient; the "strict-mode rejection of unknown keys" test the proposal asks for has nothing to assert and is dropped (§8).

---

## 1. Architecture at a glance

Nothing is invented. The OIDC round trip moves **onto the device** (ADR-035's whole point), and the server keeps only the last two steps it already runs for web: verify an identity, then issue the standard session.

```
apps/mobile  (EAS Android build — NOT Expo Go, see §2.4)
  │ 1. tap "Ingresar con Google"   (rendered only when capabilities.googleLoginMobileEnabled)
  ▼
expo-auth-session   useAuthRequest({ clientId: ANDROID, responseType: 'code', PKCE S256 })
  │ 2. promptAsync() → Custom Tab (OS browser — never an embedded WebView, ADR-035)
  ▼
accounts.google.com ── consent ──▶ cl.moneydiary.app:/oauthredirect?code&state
  │ 3. expo-auth-session validates `state` ON DEVICE (it minted it)
  ▼
exchangeCodeAsync(code + code_verifier) → POST oauth2.googleapis.com/token   (public client, NO secret)
  │ 4. { id_token, access_token } — only id_token is kept; access_token is dropped on the floor
  ▼
POST https://api.moneydiary.cl/api/auth/google/token      header: x-api-key
     body: { "idToken": "<jwt>" }
  │
  │  ┌ IpRateLimiter "google-token:ip:"                                      → 429
  │  ├ GoogleIdTokenVerifier.verificarIdToken()
  │  │     OAuth2Client.verifyIdToken({ idToken, audience: [CLIENT_ID_ANDROID] })
  │  │     JWKS signature · iss · exp · aud ∈ array            → IdentidadExterna
  │  └ LoginConGoogleUseCase.execute(identidad)   ← UNCHANGED, shared verbatim with web
  ▼
200 { token, userId, expiresAt }          (byte-identical body to POST /api/auth/login)
  │ 5. guardarToken(token) → SecureStore → signIn(token) → Stack.Protected flips
  ▼
resumen screen
```

Layer map (ADR-005 holds — `domain ← application ← infrastructure`):

| Layer | Artifact | Action |
|---|---|---|
| `domain/` | — | **Zero changes.** `VerificacionIdentidadFallidaError` and `LoginConGoogleFallidoError` are reused as-is. |
| `application/ports/verificador-identidad-externa.port.ts` | `IVerificadorIdTokenExterno` (3rd role interface) | Modify (+~20 lines) |
| `application/use-cases/login-con-google.use-case.ts` | — | **Zero changes.** |
| `infrastructure/oidc/google-id-token.adapter.ts` | `GoogleIdTokenVerifier` | Create |
| `infrastructure/http-express/routes/auth-google-token.routes.ts` | `registrarAuthGoogleToken` + `…Deshabilitado` | Create |
| `infrastructure/http-express/schemas/auth-google-token.schema.ts` | request contract | Create |
| `infrastructure/http-express/schemas/auth-capabilities.schema.ts` | `+ googleLoginMobileEnabled` | Modify |
| `infrastructure/http-express/routes/auth-capabilities.routes.ts` | deps object (two gates) | Modify |
| `infrastructure/http-express/schemas/openapi-document.ts` | new path, appended last | Modify |
| `infrastructure/http-express/app.ts` | mount `authGoogleTokenApi` | Modify |
| `composition/crear-auth-google-mobile.ts` | `GoogleAuthMobileGraph` | Create |
| `composition/container.ts` | `googleAuthMobile?` | Modify |
| `composition/assert-google-auth-activation-consistency.ts` | sibling assertion | Modify |
| `infrastructure/http-express/server.ts` | call the sibling assertion | Modify |
| `config/env.ts` | `GOOGLE_CLIENT_ID_ANDROID` | Modify |
| `apps/api/.env.example`, `apps/api/openapi.json` | regenerated by scripts | Modify |
| `apps/mobile/src/api/{config,client}.ts`, `use-google-id-token.ts` | transport | Modify / Create |
| `apps/mobile/src/components/GoogleLoginButton.tsx`, `LoginScreen.tsx`, `app/login.tsx`, `app.json` | UI | Create / Modify |
| `apps/api/docs/google-login-mobile-runbook.md` | provisioning runbook | Create |

**Untouched by construction:** the whole of `apps/web`, `openid-client-google.adapter.ts`, `crear-auth-google.ts`, `auth-google.routes.ts`, `cookie.ts`, the Prisma schema (`User.googleSub` already exists — zero schema delta).

---

## 2. D1 — `expo-auth-session` configuration and which client ID lands in `aud` (proposal risks 1 and 2) — **highest-risk decision**

### 2.1 Decision

**Generic `AuthSession.useAuthRequest` against Google's discovery document, `response_type=code` + PKCE S256, using the *Android* OAuth client ID, with the code exchanged on-device by `exchangeCodeAsync`. The expected `aud` is therefore the Android client ID, and `GOOGLE_CLIENT_ID_ANDROID` is the only accepted audience.**

```ts
// apps/mobile/src/api/use-google-id-token.ts (shape, not final code)
const discovery = useAutoDiscovery('https://accounts.google.com');
const redirectUri = makeRedirectUri({ scheme: 'cl.moneydiary.app', path: 'oauthredirect' });
const [request, , promptAsync] = useAuthRequest(
  { clientId: GOOGLE_CLIENT_ID_ANDROID ?? '', scopes: ['openid', 'email', 'profile'],
    redirectUri, responseType: 'code', usePKCE: true },
  discovery,
);
// on { type: 'success' }: exchangeCodeAsync({ clientId, code, redirectUri,
//   extraParams: { code_verifier: request.codeVerifier } }, discovery).idToken
```

Why this yields the Android `aud`: the token endpoint mints the `id_token` for the `client_id` that presented the authorization code. With a native (public) client + PKCE there is no secret to withhold, and no web client is involved anywhere in the exchange.

### 2.2 Rejected alternatives

| Alternative | Why rejected |
|---|---|
| `expo-auth-session/providers/google` helper (`useAuthRequest`/`useIdTokenAuthRequest`) | It is the exact source of the `aud` ambiguity the proposal flagged: it multiplexes `androidClientId`/`iosClientId`/`webClientId`, historically routed through Expo's auth proxy (whose redirect a native Google client cannot accept, forcing the *web* client ID and therefore a web `aud`), and hides which client actually signed the token. Hiding the one claim that is the highest-severity control of this change is exactly the kind of magic ADR-028 removed from the backend. |
| Implicit `response_type=id_token` | Google's implicit flow requires a **web** client (native clients do not support it) — it structurally forces the web `aud`, and drops PKCE. Strictly weaker for no benefit. |
| `@react-native-google-signin` / Credential Manager | Not the mechanism ADR-035 decided. It also returns an `id_token` audienced to the **web** `serverClientId` by design, and adds a native module + config plugin outside the Expo-managed workflow. |
| Backend accepts *any* of {android, web} client IDs "to be safe" | Widening the audience array to absorb ignorance is the anti-pattern: `aud` is the only thing separating "a Google token minted for MoneyDiary's Android app" from "a Google token minted for something else". The array is an **iOS extension point**, not a guess-absorber. |

### 2.3 Residual risk and how it is retired (blocks hardening, not `sdd-tasks`)

I have no network access and cannot execute the flow, so **the actual `aud` is asserted from protocol reasoning, not observed**. This is retired by a **mandatory apply-time verification step**, before slice C2 is hardened:

1. Build an EAS `development` (or `preview`) APK with `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID` set.
2. Run the flow against a **local** API. Temporarily log the decoded `aud` and `azp` of the received `id_token` **in the dev-only path** — never a committed log line, never in production (AUTH-18).
3. Assert `aud === GOOGLE_CLIENT_ID_ANDROID`. Delete the temporary log before the PR.

**If `aud` turns out to be something else**, the pre-approved order of remedies is: (a) fix the client/redirect configuration so the Android client is genuinely the one exchanging the code — this is the correct outcome and almost certainly what a misconfiguration looks like; (b) only if (a) is provably impossible, escalate to the user (§14) before adding a second audience, because adding the web client ID materially widens the trust boundary and is a **product/security decision, not an implementation detail**.

### 2.4 Two consequences worth writing down

- **Redirect scheme.** Google's Android OAuth clients accept a custom-scheme redirect derived from the **package name**, not an arbitrary app scheme. `moneydiary://` will not be accepted. `app.json` therefore becomes `"scheme": ["moneydiary", "cl.moneydiary.app"]` — the existing scheme is kept (deep links and `expo-router` depend on it), and the package-name scheme is added for OAuth only. Verified on device in the same step as §2.3; contingency is the reversed-client-id scheme (`com.googleusercontent.apps.<id>`), which is a second entry in the same array.
- **Expo Go cannot run this flow.** Custom schemes require a real build. Every device check in this change is against an EAS build. This is a hard testability boundary, not a preference (§11.4).

---

## 3. D2 — Android client provisioning: how many client IDs, and how env separates them (proposal risk 3)

An Android OAuth client is keyed by **package name + SHA-1 of the signing certificate**. MoneyDiary has two distinct signing identities:

| Signing identity | Used by | Fingerprint source |
|---|---|---|
| **EAS-managed keystore** | `development`, `preview` (internal APK) and `production` EAS builds — one project keystore, so **one** fingerprint covers all three profiles | `eas credentials -p android` → Keystore → SHA-1 |
| **Local Android debug keystore** | `expo run:android` on a developer machine | `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey` |

**Decision: provision ONE Android OAuth client (the EAS keystore) as the shipped identity. A second, debug-keystore client is optional and local-only. There is exactly ONE backend env var, whose value differs per environment.**

Why one var is enough, despite two possible fingerprints: `NODE_ENV`-separated environments already have separate env sources. The production API is reached by EAS-signed builds (note `eas.json`'s `preview` profile already points `EXPO_PUBLIC_API_BASE_URL` at the production API — same keystore, same client ID, so this works). A developer running a debug-signed build points at their **local** API, which reads its own `.env`. The unsupported combination — debug build against the production API — is documented as unsupported rather than accommodated with a second production audience (YAGNI, and every extra accepted audience is a permanently widened trust boundary).

Internally the value is still stored as an **array** (`[env.GOOGLE_CLIENT_ID_ANDROID]`) because `verifyIdToken` takes one and adding iOS later must be a config change, not a redesign. That is the proposal's sanctioned YAGNI exception — a list shape, not an iOS feature.

Rejected: a comma-separated multi-audience var (invites "add one more and see if it works" during an outage — the exact failure mode `aud` validation exists to prevent); a var per build profile (three vars, three boot rules, to express one fingerprint).

---

## 4. D3 — Port shape: a third role interface, not an extension (proposal risk 5)

**Decision: add `IVerificadorIdTokenExterno` as a THIRD role interface in the existing `application/ports/verificador-identidad-externa.port.ts`. Do not add a method to `IVerificadorIdentidadExterna`.**

```ts
/** Consumido por la ruta POST /api/auth/google/token (mobile, ADR-035). */
export interface IVerificadorIdTokenExterno {
  verificarIdToken(
    idToken: string,
  ): Promise<Result<IdentidadExterna, VerificacionIdentidadFallidaError>>;
}
```

Rationale, against the `solid` skill's own checks:

- **LSP.** Adding `verificarIdToken` to `IVerificadorIdentidadExterna` forces `OpenIdClientGoogleAdapter` to implement it — and the exploration proved `openid-client` v6.8.4 has no clean standalone `id_token` validator (`implicitAuthentication` needs the token embedded in a URL *and* a mandatory `expectedNonce`, which ADR-035 §5 explicitly does not have). The only implementation available is `throw new Error('no implementado')` — literally the violation the skill names ("una strategy que lanza 'no implementado' para parte de su contrato").
- **ISP.** The two verifiers have genuinely disjoint inputs (`ParametrosCallback` vs a raw JWT) and disjoint consumers (the web callback route vs the mobile token route). A merged port would force each route's test double to stub a method it can never call.
- **Precedent, not novelty.** The file already holds two role interfaces satisfied by one adapter (web design §4.1). This is the third entry in an established pattern, and it costs one interface, zero files, zero runtime.
- **`LoginConGoogleUseCase` stays untouched** — it never receives a verifier at all (the route resolves the identity first and passes `IdentidadExterna` in). That is what makes the find-only policy, the `email_verified` gate, the demo exclusion and rule ★ inherited *by construction*.

`IdentidadExterna` and `VerificacionIdentidadFallidaError` are reused verbatim: **zero changes**.

Rejected: a brand-new port file (splits one cohesive concept — "how an external identity is established" — across two files for no gain); a generic `IVerificadorIdentidadExterna<TParams>` (generics to unify two concrete cases with one implementation each is the textbook premature abstraction).

---

## 5. D4 — The verification adapter, the library, and JWKS failure (proposal risk 9, new deps)

### 5.1 Library: `google-auth-library`

| Option | Verdict |
|---|---|
| **`google-auth-library`** (`OAuth2Client.verifyIdToken`) | **Chosen.** Vendor-owned semantics for the Google-specific parts that are easy to get subtly wrong: both accepted `iss` forms (`accounts.google.com` and `https://accounts.google.com`), the certificate endpoint and its rotation/caching, and `aud` matched against an array. It is the documented path for exactly this use case ("authenticate with a backend server"). |
| `jose` | Rejected, but it was close. Zero-dependency (a genuine win under `.npmrc`'s `block-exotic-subdeps=true` and the `pnpm audit --audit-level=high` gate) — but we would own the `iss` list and the JWKS URL by hand, on the single highest-severity control of the change, on its first implementation. **Revisit trigger:** if `pnpm audit` ever flags the `gaxios`/`gtoken` subtree, swapping is a one-file change because the adapter is the only importer. |
| `openid-client` (already installed) | Rejected — proven not to fit (see §4). |

`.npmrc` gotcha: `minimum-release-age=10080` (7 days). Confirm at apply time with `npm view google-auth-library time` before slice A1, and `npx expo install` (SDK-pinned, normally well past 7 days) for the mobile deps. pnpm's isolated resolution means every direct dep must be declared explicitly in the owning workspace's `package.json`.

### 5.2 The adapter

`infrastructure/oidc/google-id-token.adapter.ts` — `GoogleIdTokenVerifier implements IVerificadorIdTokenExterno`. The only file in the repo that imports `google-auth-library`.

```ts
/** Superficie mínima que el adapter usa de OAuth2Client (ISP: el double de
 *  test implementa UN método, no el cliente entero). */
export interface ClienteVerificadorIdToken {
  verifyIdToken(opciones: { idToken: string; audience: string[] }): Promise<{
    getPayload(): { sub?: string; email?: string; email_verified?: boolean } | undefined;
  }>;
}

constructor(
  private readonly audiencias: readonly string[],
  private readonly cliente: ClienteVerificadorIdToken = new OAuth2Client(),
) {}
```

Behaviour:

- Empty/blank `idToken` → `Result.fail` **without** calling the library (no pointless JWKS fetch on a trivially bad request).
- `verifyIdToken` throws for every invalid case (bad signature, wrong `aud`, wrong `iss`, expired) and for network failure. **Every throw is caught and mapped to `Result.fail(new VerificacionIdentidadFallidaError(motivo))`** — nothing from `google-auth-library` ever crosses the port (ADR-005, same discipline as `OpenIdClientGoogleAdapter`).
- Missing payload or missing `sub` → `Result.fail('payload-invalido')`.
- Success → `{ sub, email: payload.email ?? null, emailVerificado: payload.email_verified === true }`. Everything else — `name`, `picture`, `access_token` — is dropped and never crosses the port (AUTH-18).
- No client-side JWKS cache of our own: the library caches Google's certs internally. One `OAuth2Client` instance lives in the composition graph for the process lifetime, so the cache is actually shared.

### 5.3 JWKS / network failure → generic 401, never 503 (proposal risk 9)

**Decision: a JWKS fetch failure produces the same generic 401 as an invalid token. The distinction lives in the log level, not in the response.**

- **AUTH-15 uniformity.** Any status that varies with the *cause* is an oracle surface, however weak. The web flow already took this posture (a discovery failure yields the same generic redirect).
- **Indistinguishable at the adapter anyway.** Telling "network" from "bad signature" would mean string-matching `google-auth-library`'s error messages — brittle, and it would break silently on a library upgrade.
- **Zero client benefit.** The mobile copy is one generic message either way; a 503 branch would be dead code.

Observability keeps the distinction, mirroring `auth-google.routes.ts` exactly: modeled failures log `.warn` + `motivo`; unexpected throws log `.error` + `errorName`. The honest cost: during a Google outage the user sees "could not sign in" rather than "try later". Accepted, and recorded so nobody "fixes" it later by leaking the cause.

---

## 6. D5 — The endpoint: shape, activation, errors, logging, rate limiting (proposal risk 6)

### 6.1 Route and activation

`routes/auth-google-token.routes.ts`, exporting `registrarAuthGoogleToken(router, deps)` and `registrarAuthGoogleTokenDeshabilitado(router)`.

**The 404-vs-401 trap applies here too, and it is not covered by the existing stub.** `registrarAuthGoogleTokenDeshabilitado` is genuinely required: the existing disabled stub registers only `GET /auth/google` and `GET /auth/google/callback`. A `POST /auth/google/token` with nothing mounted falls through into `protectedApi`, whose path-less `router.use(sessionMiddleware(...))` runs for every request that reaches the router and answers **401**, not the 404 the activation contract requires.

`app.ts` gains one more router with its own branch, immediately after `authGoogleApi`:

```ts
const authGoogleTokenApi = express.Router();
if (container.googleAuthMobile !== undefined) {
  registrarAuthGoogleToken(authGoogleTokenApi, container.googleAuthMobile);
} else {
  registrarAuthGoogleTokenDeshabilitado(authGoogleTokenApi);
}
app.use('/api', authGoogleTokenApi);
```

A **separate** router (not a branch inside `authGoogleApi`) because the two gates are independent by locked decision Q2: web can be on with mobile off, and vice versa.

### 6.2 Request/response contract

- **Success:** `200 { token, userId, expiresAt }` — the OpenAPI operation reuses `authLoginResponseSchema` verbatim, so the document *proves* the bodies are the same rather than asserting it in prose.
- **Body handling mirrors `/auth/login` exactly:** `const idToken = typeof body?.idToken === 'string' ? body.idToken : ''`. **No 400.** A missing or non-string `idToken` takes the same generic 401 path. Two reasons: consistency with the only other credential-accepting endpoint in the codebase, and one less externally distinguishable outcome (AUTH-15). The `''` case short-circuits in the adapter without a network call (§5.2).
- **Failure:** `401 { message: <generic> }` for every cause — invalid token, wrong `aud`, expired, unverified email, no matching user, demo user, already linked to another `googleSub`, JWKS failure, unexpected throw. Same status, same body.
- **No `Set-Cookie`.** Mobile uses Bearer + SecureStore (MOB-02); emitting a session cookie here would be dead weight on a client that ignores it.

### 6.3 No Sec-Fetch guard here — decided explicitly, not copied

`esNavegacionDeNivelSuperior` exists to stop a **state-changing GET** from being triggered by browser embedding (`<img>`, `<iframe>`). This endpoint is a `POST` with a JSON body and a required `x-api-key`, invoked by a native client that sends no `Sec-Fetch-*` headers at all — the guard's documented fail-open-when-absent behaviour means it would pass unconditionally. Mounting it would be pure cargo cult. Cross-origin browser abuse is already blocked by the CORS allowlist plus the api-key.

### 6.4 Rate limiting — own instance, own prefix, looser budget than web

**Decision: a dedicated `IpRateLimiter('google-token:ip:', 30, 15 * 60_000)` — 30 attempts per IP per 15 minutes. Hardcoded constants, no new env vars (matching the existing limiters' documented reasoning: a product value, not an operator knob).**

Reasoning, deliberately not copied from the web limiter:

- **The threat is different.** Forging an `id_token` is impossible without Google's signing key, so this is not a brute-force surface. The limiter is an abuse/cost guard: bounded work per request (library-cached JWKS + at most two indexed queries), plus a cap on probing with real tokens from many Google accounts.
- **Carrier-grade NAT is the binding constraint.** Mobile clients share egress IPs far more heavily than the web flow's residential/office browsers. The web budget (10 / 15 min) would lock out legitimate users on a shared carrier IP. 30 is loose enough to survive that and still hard-caps abuse.
- **A separate instance, not a shared one**, so the web flow and the mobile flow can never consume each other's budget (they already have independent activation gates).

**Decision: the budget counts failed attempts only — a successful login resets the IP's bucket.** Same parity as `/auth/login`: `recordFailure(ip)` runs optimistically before the verification/lookup await (avoids a check-then-act race under concurrent requests), and `googleTokenRateLimiter.reset(ip)` runs once `loginConGoogle.execute` returns `ok`, right before the 200 response. Accepted residual: an actor that keeps replaying a *valid* token for its own account can reset its own bucket indefinitely — this is irrelevant because the endpoint is a uniform-401 non-oracle (AUTH-21) and cannot be used to probe other accounts; garbage/forged attempts still hard-cap at 30 per 15 minutes regardless of how many successful requests interleave.

### 6.5 Logging (ADR-033 / AUTH-18)

`appLogger.warn('…', { path: req.path, motivo })` on modeled failures; `.error` with `errorName` on unexpected throws. **Never** the `idToken`, the email, `googleSub`, or the session token. The existing `redactSensitiveQueryParams`/`redactSensitiveQueryObject` pair (`infrastructure/http-express/middleware/redact-sensitive-query-params.ts`, whose `PARAMS_SENSIBLES` set already includes `id_token`) already covers `id_token` as a query key — this endpoint carries it in the **body**, which `pino-http` does not serialize, so no new redaction path is required. A regression test asserts the token value never appears in the captured NDJSON stream.

---

## 7. D6 — Env and activation (ADR-029)

One new key in `EnvObjectSchema`, `.optional()` and `.describe(...)`d so `pnpm api env:example` regenerates `.env.example` (checked in CI):

| Key | Rule |
|---|---|
| `GOOGLE_CLIENT_ID_ANDROID` | optional string, `min(1)` |

`refineGoogleAuthEnv` gains a sibling, `refineGoogleAuthMobileEnv`, wired from `refineByEnvironment` — separate function, same readability reasoning the file already documents for itself. Its rules:

1. **Absent → feature off.** No error, in any environment. This is the kill switch.
2. **Present → must end with `.apps.googleusercontent.com`.** With a single variable there is no "all-or-nothing" pair to enforce; the equivalent fail-fast guard is a **format assertion** that catches the realistic misconfiguration (a pasted client *secret*, a truncated value, a placeholder). Stating this plainly rather than inventing a second variable to have a pair to check.
3. **Present → must differ from `GOOGLE_CLIENT_ID`.** A copy-paste of the web client ID into the native slot would silently widen the accepted audience to the web client — the precise confusion §2 exists to prevent. One string comparison at boot closes it.
4. **Fully independent of the web pair.** All four on/off combinations are valid and unit-tested.

No production-specific rule: there is no `https`/URL to constrain, and a production deploy with the feature off is a legitimate state.

**Composition.** `composition/crear-auth-google-mobile.ts`, mirroring `crear-auth-google.ts`:

```ts
export interface GoogleAuthMobileGraph {
  readonly verificadorIdToken: IVerificadorIdTokenExterno;
  readonly loginConGoogle: LoginConGoogleUseCase;
  readonly googleTokenRateLimiter: IpRateLimiter;
}

export function crearAuthGoogleMobile(
  prisma: PrismaClient,
  env: Pick<Env, 'GOOGLE_CLIENT_ID_ANDROID'>,
  blindIndex: IBlindIndexService,
): GoogleAuthMobileGraph | undefined
```

Returns `undefined` when the var is absent — the **type** is the activation seam, exactly as `container.googleAuth` already is; no boolean flag exists anywhere. `blindIndex` is received (never re-derived) for the same reason `crearAuthGoogle` receives it: a second HKDF derivation produces a different index and every email link silently misses. `reloj`/`tokens`/`sessions`/`identidades` are constructed internally, per the established pattern.

A **second `LoginConGoogleUseCase` instance** is built here rather than shared with `crearAuthGoogle`. It is stateless over `prisma`, and sharing it would mean either threading it through both factories or making mobile depend on web's activation state — coupling the two independent gates for no benefit.

**Boot assertion.** `assert-google-auth-activation-consistency.ts` gains a sibling `assertGoogleAuthMobileActivationConsistency(env, googleAuthMobile)`, called from `server.ts` next to the existing one. It catches the composition bug where the env var is set but the factory returned `undefined` — which would make capabilities report `true` while the endpoint 404s. Two near-identical 15-line functions in one file is **deliberate duplication under the `yagni` skill's three-strikes rule**: the second occurrence is noted, not extracted, because generalizing would require parameterizing the error message and the env keys — more machinery than the duplication costs.

---

## 8. D7 — The capabilities contract (proposal risk 4)

**Decision: one additive boolean, `googleLoginMobileEnabled`. `googleLoginEnabled` keeps its current web-only meaning, unchanged.**

```ts
export const authCapabilitiesResponseSchema = z.object({
  googleLoginEnabled: z.boolean().describe('… WEB flow only (GOOGLE_CLIENT_ID + SECRET) …'),
  googleLoginMobileEnabled: z.boolean().describe(
    'true when GOOGLE_CLIENT_ID_ANDROID is configured (container.googleAuthMobile !== undefined). ' +
    'Independent of googleLoginEnabled — either gate can be on without the other.'),
}).meta({ id: 'AuthCapabilitiesResponse', description: '…' });
```

**The live web client tolerates the new key — verified, not assumed.** `apps/web/src/api/capabilities.ts`'s `esAuthCapabilitiesDto` is a structural guard that checks only `typeof candidato.googleLoginEnabled === 'boolean'`; unknown keys pass through and are ignored by TanStack Query and by `GoogleLoginButton`. **No `apps/web` file changes in this change** — which is also what makes the "web untouched" non-goal literally true.

Rejected: renaming to a per-client object (`{ google: { web, mobile } }`) — a breaking contract change against a deployed client, for cosmetics; a single flag meaning "either" — it would show the mobile button when only web is configured, and the endpoint would 404.

**Deviation from ADR-035 point 4.** ADR-035 literally prescribes that mobile consult the *same* `googleLoginEnabled` flag as web — "one source of truth of activation for both clients." This design deliberately deviates: the two gates (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` for web, `GOOGLE_CLIENT_ID_ANDROID` for mobile) are independent env configurations, so a shared flag would misreport activation whenever only one of the two is configured — exactly the "single flag meaning 'either'" case rejected above. A second, independent boolean is required to honor the activation-consistency invariant (AC-10) when the two gates differ. This is a user-approved decision; a one-line amendment to ADR-035 §Decision point 4 should ride the implementation PR.

What must move together (all inside one slice, or CI fails):

1. `auth-capabilities.schema.ts` — the new field.
2. `auth-capabilities.routes.ts` — signature becomes `registrarAuthCapabilities(router, { googleAuth, googleAuthMobile })`. An **object**, not two positional params of the same nullable shape, which would be trivially swappable by mistake. It still receives the graph fields, not pre-computed booleans, preserving "the type is the flag".
3. `app.ts` — the call site.
4. `openapi-document.ts` — description text; the schema is referenced, so the component updates itself.
5. `pnpm api openapi:emit` → `apps/api/openapi.json`, or `openapi:check` fails in CI.
6. The route spec — both flags across all four activation states.

Dropped from the proposal's test list: "strict-mode rejection of unknown keys" — the schema is not `.strict()` (see the correction in the header) and never was.

---

## 9. D8 — Mobile client, UI, and capability timing (proposal risk 10)

### 9.1 Transport

- `src/api/config.ts` gains `export const GOOGLE_CLIENT_ID_ANDROID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID || undefined;` — same "absent means not configured" discipline as `API_BASE_URL`. A Google client ID is a **public identifier**, so unlike `EXPO_PUBLIC_API_KEY` it needs no EAS Secret; it lives in `eas.json`'s per-profile `env`.
- `src/api/client.ts` gains two never-throwing functions in the established `ApiResult<T>` style:
  - `postGoogleIdToken(idToken)` — mirrors `postLogin` exactly (same `x-api-key`-only headers, same `esLoginResponseDto` guard, same `LoginResponseDto`, same typed failure tags). It reuses the *existing* guard rather than defining a second one, because the body genuinely is the same DTO.
  - `fetchAuthCapabilities()` — `GET /api/auth/capabilities` with `x-api-key` only. Explicit headers, **not** `construirHeadersSesion`, because there is no session at this point and attaching a stale Bearer would be noise.
- `src/api/use-google-id-token.ts` — the only file importing `expo-auth-session`. Exposes `{ listo: boolean; obtenerIdToken: () => Promise<string | null> }`. `useAuthRequest` is a hook and cannot be called conditionally, so an absent client ID is handled by passing `''` and reporting `listo: false`. Every failure path — `promptAsync` returning `dismiss`/`cancel`/`error`, a throwing `exchangeCodeAsync`, a token response with no `idToken` — collapses to `null`. Nothing throws.

New mobile deps, installed with `npx expo install` so versions are SDK-pinned: **`expo-auth-session`**, **`expo-crypto`** (PKCE S256 on native) and **`expo-web-browser`** (the Custom Tab that `promptAsync` opens). All three declared explicitly in `apps/mobile/package.json` — pnpm's isolated resolution does not hoist transitive deps.

### 9.2 UI

- `src/components/GoogleLoginButton.tsx` — pure presentational `Pressable`, `testID="login-google"`, `accessibilityRole="button"`, label **"Ingresar con Google"** (matches the product name and mobile's existing "Ingresar" verb). Visually **secondary**: outlined/neutral, not the filled `COLORS.ingreso` primary — per the accepted product assumption.
- `LoginScreen.tsx` gains two optional props, `mostrarGoogle?: boolean` and `onGoogleSubmit?: () => void`, and renders the button **below** the submit `Pressable`. **`LoginEstado` is not extended** — `submitting` disables both affordances and `error` shows the existing `MENSAJE_ERROR_GENERICO`. One state machine, one message, matching the locked "one generic message for every Google failure" decision. Cancelling therefore shows an error; that is the accepted assumption, and reversing it is a one-branch change (§14).
- `app/login.tsx` owns orchestration: the capability `useState<boolean>(false)`, a mount-time `useEffect` calling `fetchAuthCapabilities`, and `ingresarConGoogle` with the same double-tap guard `enviar` already has. On success: `guardarToken(token)` → `signIn(token)`, byte-identical to password login. On any failure: `setEstado({ fase: 'error' })` and **no token is written** (asserted in tests).

### 9.3 Capability timing — fail-closed, fetched once, no retry

**Decision: fetch on mount in `app/login.tsx`, default `false`, any failure keeps it `false`, no retry.** The button renders only when `capabilities.googleLoginMobileEnabled === true` **AND** `GOOGLE_CLIENT_ID_ANDROID !== undefined` **AND** the auth request is ready — three independent fail-closed conditions.

Not in `SessionProvider`: that context owns the session gate (SRP), and putting the fetch there would issue the call on every cold start including already-authenticated ones, for a screen that may never render. Same posture as web's `staleTime: Infinity, retry: false`. No layout jump to manage — an absent button simply is not there.

### 9.4 Bounding the flow's network legs (judgment-day fix, post-implementation)

The Google flow has three network legs plus one user-driven leg, and only the network legs are time-bounded:

- `exchangeCodeAsync` (`use-google-id-token.ts`), `postGoogleIdToken`'s fetch, and `fetchAuthCapabilities`'s fetch are wrapped in `conTimeout` (`src/api/con-timeout.ts`) at `NETWORK_LEG_TIMEOUT_MS = 20_000`. A timeout rejects the same way any other failure of that leg already did — `exchangeCodeAsync`'s existing try/catch collapses it to `null`; the two `fetch` calls' existing try/catch collapses it to `{ ok: false, error: { tag: 'network' } }`. No new branches, no sentinel values.
- `promptAsync` is **deliberately left unbounded**. It is user-driven (the user is inside a Custom Tab; a legitimate 2FA challenge can take minutes) and browser dismissal already resolves the promise — there is no hang risk that a client-side timer would meaningfully mitigate, only a risk of cutting off a slow-but-legitimate user.
- 20s mirrors the backend's `ID_TOKEN_HTTP_TIMEOUT_MS` convention (`apps/api/src/infrastructure/oidc/google-id-token.adapter.ts`, 10s for a server-to-Google call) scaled up for a mobile network's higher latency variance.
- **Residual accepted risk:** a pathological `promptAsync` hang (a library bug that never settles, not a slow user) still locks the shared `submitting` state machine indefinitely, since only the network legs are bounded. This is judged acceptable because the user is physically inside the Custom Tab during that window, and dismissing it resolves the promise — the failure mode requires an unresponsive library bug, not ordinary network conditions, and is distinguishable in practice from the network hangs this fix targets.

---

## 10. Data flow summary for the security-critical path

```
idToken (client-supplied, untrusted)
   │
   ├─ '' or blank ────────────────────────────────► Result.fail        → 401 generic
   │
   ├─ verifyIdToken({ idToken, audience: [ANDROID] })
   │     signature ✗ / iss ✗ / exp ✗ / aud ∉ array / JWKS down
   │                              └─────────────► Result.fail        → 401 generic
   │
   └─ payload { sub, email, email_verified }
         └─► IdentidadExterna ─► LoginConGoogleUseCase (UNCHANGED)
                  ├ googleSub match, not demo ────────────► session   → 200
                  ├ googleSub match, demo ────────────────► fail      → 401 generic
                  ├ !email_verified ──────────────────────► fail      → 401 generic
                  ├ email no match ───────────────────────► fail      → 401 generic  (no user created)
                  ├ email match, demo ────────────────────► fail      → 401 generic
                  ├ email match, other googleSub  ★ ──────► fail      → 401 generic  (no re-link)
                  └ email match, unlinked ─► link ────────► session   → 200
```

Every rejection is the same status, the same body. **Accepted residual risk:** the same latency class is not claimed — the pre-DB failure branches (blank token, JWKS/signature/`iss`/`exp`/`aud` rejection) and the post-DB branches (unknown identity, demo match, unverified email, rule ★) plausibly differ in timing, and this is not addressed here. Exploiting that timing difference requires an attacker to already hold a validly-signed Google `id_token`, which narrows the practical value of a timing side-channel; the same accepted-risk posture as AUTH-23's no-`nonce` write-up applies — documented, not silently omitted, and not hardened in this change.

---

## 11. Testing strategy

Strict TDD is active — tests first. `pnpm api test` / `pnpm api test:integration` / `pnpm --filter @moneydiary/mobile test`.

### 11.1 Unit — `pnpm api test`, no database

| Target | Cases |
|---|---|
| `GoogleIdTokenVerifier` (double for `ClienteVerificadorIdToken`) | valid payload → `IdentidadExterna` mapping (`email` null when absent, `emailVerificado` only when strictly `true`); payload undefined → fail; `sub` missing → fail; library throws (bad signature / wrong `aud` / wrong `iss` / expired / network) → `Result.fail`, **never throws**; empty `idToken` → fail **without calling the client** (assert the double was not invoked); audience array passed through with one entry and with several |
| `config/env.ts` | var absent → off; present → on; wrong suffix → boot fails; equal to `GOOGLE_CLIENT_ID` → boot fails; **all four** web×mobile on/off combinations; `env:example:check` |
| `crearAuthGoogleMobile` | `undefined` when unconfigured; full graph when configured; receives (never re-derives) `blindIndex` |
| `assertGoogleAuthMobileActivationConsistency` | throws on drift; silent otherwise |
| `auth-capabilities` route + schema | four states of the two flags; response type/schema sync |
| `POST /api/auth/google/token` via **supertest + fake container** | 404 when `googleAuthMobile === undefined`; 200 + exact body on the happy path with a verifier double; 401 generic for every failure branch; missing/non-string `idToken` → 401 (not 400); 429 after 30 attempts; `Set-Cookie` **absent**; log capture asserts the `idToken` value never appears in the NDJSON stream |
| Request schema / handler (AUTH-23 regression) | the request schema/handler requires and validates **no** `nonce` field — a request carrying an unexpected `nonce` key is accepted and ignored (not rejected), pinning the accepted no-nonce tradeoff (ADR-035 §5) so it cannot silently regress into a required-nonce contract |
| OpenAPI | `openapi:check` passes; the new path is present and reuses `AuthLoginResponse` |

`createApp(container, env)` takes an injected `Container`, so the entire HTTP surface above is provable without a database.

### 11.2 Integration — `pnpm api test:integration` (real Postgres, **runs in CI**)

Only what genuinely touches the DB, all with a **double of `IVerificadorIdTokenExterno`** — never live Google:

- Happy path writes a real `Session` row: SHA-256 hash, `expiresAt` = creation + 7 days, indistinguishable from a password-login row.
- Unknown identity → 401 and the `user` row count is unchanged.
- `email_verified: false` → 401 and no `googleSub` written.
- Demo account (via both the `googleSub` and the email path) → 401.
- Email matches a user already linked to a *different* `googleSub` (★) → 401 and the stored value is **not** overwritten.
- Endpoint 404s when the container has no mobile graph.

Rate limiting stays in unit tests — it is in-process state with no DB involvement.

### 11.3 Mobile — `pnpm --filter @moneydiary/mobile test` (jest-expo + RNTL)

`jest.mock('expo-auth-session')` supplies fakes for `useAutoDiscovery`, `useAuthRequest`, `exchangeCodeAsync` and `makeRedirectUri`. Mocking at the native boundary is the only option and is documented in the spec file.

- Button hidden when the capability flag is `false`, when the capabilities call fails, and when `GOOGLE_CLIENT_ID_ANDROID` is undefined.
- Button visible only when all three conditions hold.
- Success: `promptAsync` → `exchangeCodeAsync` → `postGoogleIdToken` → `guardarToken` called with the returned token → `signIn` called.
- Cancel / error / no `idToken` in the exchange response / 401 from the API: generic error shown and **`guardarToken` never called**.
- Double-tap guard: a second press while `submitting` is a no-op.
- `postGoogleIdToken` / `fetchAuthCapabilities` unit tests with a stubbed `fetch`: header set, tag mapping, never throws.

### 11.4 Not provable pre-merge — manual device gate

Real Google sign-in is unreachable from Expo Go, jest-expo, CI and Maestro (Google actively blocks automated consent). Before slice C2 merges, run this on a physical Android device with an EAS build and paste the result into the PR:

1. **`aud` verification (§2.3)** — decode the received `id_token` against a local API and confirm `aud === GOOGLE_CLIENT_ID_ANDROID`. Remove the temporary log before pushing.
2. Sign in with a Google account matching an existing MoneyDiary user → lands on resumen; the token is in SecureStore.
3. Sign in with a Google account matching **no** user → generic error; confirm in the DB that no user row was created.
4. Cancel at the consent screen → generic error, no token written.
5. Kill-switch drill: unset `GOOGLE_CLIENT_ID_ANDROID` in Render → restart → endpoint 404s and the button disappears on the next app launch. Password login unaffected.

---

## 12. Migration and rollout

**No migration.** `User.googleSub` already exists; zero schema delta, zero backfill.

**Rollout is a manual, documented gate.** Merging the chain ships inert code: with `GOOGLE_CLIENT_ID_ANDROID` unset, the endpoint 404s and the button never renders, in every environment including production.

`apps/api/docs/google-login-mobile-runbook.md` (slice D) must cover, in order:

1. Read the EAS keystore SHA-1: `eas credentials -p android` → Keystore → SHA-1 Fingerprint.
2. Google Cloud Console → **the same OAuth project as the web client** → Credentials → Create OAuth client ID → Application type **Android** → package name `cl.moneydiary.app` → the SHA-1 from step 1. Copy the client ID.
3. (Optional, local dev only) repeat for the debug keystore: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`.
4. Confirm the OAuth consent screen (already configured by the web change) grants `openid`, `email`, `profile`.
5. Render → Environment → `GOOGLE_CLIENT_ID_ANDROID=<client id>` → restart.
6. `eas.json` → the target build profile's `env` → `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=<same client id>`. Not a secret; do not use EAS Secrets for it.
7. Verify: `curl -H "x-api-key: …" https://api.moneydiary.cl/api/auth/capabilities` → `googleLoginMobileEnabled: true`.
8. Build and install the internal APK; run the §11.4 checklist.
9. **Kill switch:** unset `GOOGLE_CLIENT_ID_ANDROID` in Render → restart. Endpoint 404s, button disappears on the next capabilities fetch. No deploy, no data change, web and password login untouched.

---

## 13. Delivery slices

The proposal's A/B/C/D is **adjusted**: A and B each exceed the 400-line review budget on an auth hot path once this repo's docstring and spec density is accounted for, and C is two distinct concerns (transport vs UI). Seven chained slices.

| # | Slice | Content | ~Lines | Independently shippable |
|---|---|---|---|---|
| **A1** | Port + verifier | `IVerificadorIdTokenExterno`; `google-auth-library` dep; `GoogleIdTokenVerifier` + unit specs | ~300 | Yes — inert, nothing constructs it |
| **A2** | Env + activation seam | `GOOGLE_CLIENT_ID_ANDROID` + `refineGoogleAuthMobileEnv` + specs; `.env.example`; `crearAuthGoogleMobile` + specs; `container.googleAuthMobile?`; boot assertion + spec + `server.ts` | ~270 | Yes — graph builds, nothing routes to it |
| **B1** | The endpoint | `auth-google-token.routes.ts` (real + disabled stub); request schema; `app.ts` router; OpenAPI path + `openapi:emit`; supertest specs incl. the log-redaction regression | ~380 | Yes — backend feature complete, no client shows a button |
| **B2** | DB-backed guarantees | Integration specs vs real Postgres (§11.2) | ~230 | Yes — tests only |
| **B3** | Capability discovery | `googleLoginMobileEnabled` across schema / route / `app.ts` / OpenAPI / specs | ~160 | Yes — additive, live web client unaffected |
| **C1** | Mobile transport | `expo-auth-session`/`expo-crypto`/`expo-web-browser` deps; `app.json` scheme; `config.ts`; `postGoogleIdToken` + `fetchAuthCapabilities`; `use-google-id-token.ts`; specs | ~320 | Yes — no UI reaches it yet |
| **C2** | Mobile UI | `GoogleLoginButton`; `LoginScreen` props; `app/login.tsx` orchestration; RNTL specs; **§11.4 manual device gate** | ~290 | Yes — completes the feature |
| **D** | Provisioning runbook | `apps/api/docs/google-login-mobile-runbook.md` (§12) | ~180 | Yes — docs only, cheap review |

**Revised forecast: ~1,700–1,950 changed lines** (proposal said 900–1,300). The gap is spec verbosity and docstring density, both established conventions in this repo — not scope creep. The forecast excludes slice D (docs-only, ~180 lines, not counted against the code-review budget). `Chained PRs recommended: Yes`. `400-line budget risk: High` for any coarser split.

Per-slice boundaries:

| Slice | Starts when | Finishes when | Verified by | Rollback |
|---|---|---|---|---|
| A1 | design approved | `pnpm api test` green | unit specs | revert PR; nothing imports the adapter |
| A2 | A1 merged | `pnpm api test` + `env:example:check` green | unit specs, CI env check | revert PR; graph field disappears |
| B1 | A2 merged | 404 unconfigured / 200 configured; `openapi:check` green | supertest + OpenAPI check | revert PR **or** unset the env var (instant, no deploy) |
| B2 | B1 merged | `pnpm api test:integration` green in CI | CI integration job | revert PR; tests only |
| B3 | B1 merged (B2-independent) | both flags reported; `openapi:check` green | route spec; web client untouched | revert PR; web reads only the old key |
| C1 | B1 merged | `pnpm --filter @moneydiary/mobile test` green | jest-expo specs | revert PR; no UI path exists |
| C2 | B3 + C1 merged | button gates correctly **and §11.4 pasted in the PR** | RNTL specs + manual device gate | revert PR; backend stays live and harmless |
| D | A2 merged | runbook reviewed | reading it against §12 | revert PR |

Chain: **A1 → A2 → B1 → C1 → C2 (C2 also requires B3)**; B2 and B3 branch off B1 in parallel; B2 is independent (CI-only) and blocks nothing. D is order-independent after A2 but MUST land before the manual activation gate.

Cross-cutting:

- Every backend slice touches `**/auth/**` → full **4R fan-out** review, and `judgment-day` after **B1** (the new externally-reachable trust boundary) as well as after this design.
- `.npmrc` `minimum-release-age=10080`: confirm `google-auth-library` before A1 (`npm view google-auth-library time`) and use `npx expo install` for C1.
- `pnpm api env:example` in A2, `pnpm api openapi:emit` in B1 and B3 — CI fails otherwise.

---

## 14. Open items for the user (none block `sdd-tasks`)

1. **The `aud` claim is reasoned, not observed (§2.3).** Blocks *hardening*, not planning. If the device check shows an `aud` other than the Android client ID and the configuration cannot be corrected, adding a second accepted audience is a **security decision that comes back to you** — the design will not widen the trust boundary silently.
2. **Redirect scheme (§2.4).** `app.json` gains `cl.moneydiary.app` alongside `moneydiary`. If Google rejects the package-name scheme on device, the contingency is the reversed-client-id scheme — a second array entry, no redesign.
3. **Cancelling shows an error (§9.2).** Designed to the accepted assumption. Distinguishing "you cancelled" leaks nothing and is better UX; it is a one-branch change if you want it.
4. **Line forecast revised up to ~1,700–1,950 (§13)**, across 7 slices instead of 4. Flagging because it changes the review-workload picture the proposal set.
5. **The replay window is unchanged and real** (ADR-035 §5): no server-issued `nonce`, bounded only by `exp` (~1 h). `spec` must record it as an accepted limitation, not omit it.
6. **iOS remains absent by decision.** The audience array shape is the only accommodation made; adding iOS later is one env var plus one array entry.
