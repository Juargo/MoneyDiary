# Proposal — US-004: Historial de archivos cargados

**Change:** `us-004-historial-ingestas` · **Store:** hybrid · **Scope:** `apps/api` + `apps/web`
(backend rich, thin web client — ADR-024) · **Issue:** GitHub #156 (CA-01..CA-04) · **Sprint-10**

---

## 1. Why / intent

Hoy el pipeline de ingesta es una **caja negra sin memoria de sus intentos**. Un usuario sube
una cartola (`POST /api/ingestas`) y:

- si **funciona**, la fila `PROCESADA` existe pero solo es visible como impacto en las vistas de
  dinero (resumen/semáforo/anual) — no hay una lista de "qué subí y cuándo";
- si **falla temprano** (extensión no permitida, banco no reconocido) **no queda NINGÚN rastro
  en BD** — cero fila. El error más común y accionable del usuario es justamente el que
  desaparece sin registro (verificado en `process-ingesta.use-case.ts`: los `Result.fail`
  previos a persistir no crean fila);
- si **falla tarde** (estructura/normalización/PDF/rango-fechas/dedupe/persistencia) sí se
  persiste `FALLIDA` con `motivoFallo`, **pero el reader la filtra fuera** (`estado: PROCESADA`
  hard-filter, D5 de US-018) → hoy es invisible.

El usuario necesita **trazabilidad de sus cargas**: ver el historial de archivos subidos en
orden cronológico, distinguir los exitosos de los fallidos, y para cada uno saber *cuántas
transacciones importó* (éxito) o *por qué falló* (fallo). Esto habilita detectar cargas
erróneas o duplicadas y entender un fallo sin adivinar. **Éxito = el usuario abre `/ingestas` y
ve, en una sola lista, cada intento de carga con su desenlace legible.**

## 2. Scope — IN

| # | Item | Dónde (alto nivel) |
|---|------|--------------------|
| a | **Registrar TODO intento fallido**, incluidos los tempranos (extensión, banco no reconocido) que hoy no crean fila. Central: resolver el blocker `Ingesta.accountId NOT NULL` para intentos sin cuenta resuelta | `apps/api` domain/application/infrastructure + migración Prisma |
| b | **Ensanchar `GET /api/ingestas` in-place** (NO endpoint nuevo): quitar el hard-filter `estado: PROCESADA` del reader y ampliar `IngestaListItemDto`/read-model con `nombreArchivo`, `estado`, `motivoFallo` (conservando `totalTransacciones` para CA-03 y `banco`/`fecha`) | `prisma-listar-ingestas.reader.ts`, `listar-ingestas.port.ts`, `ingesta-list.dto.ts` |
| c | **Guard de regresión US-018**: la pantalla "Gestionar cartolas" consume este mismo endpoint. Preservar lo que asume (ver §6) | reader + web `ListaIngestas.tsx` |
| d | **Web** reutilizando la pantalla `/ingestas` existente: renderizar `estado` (exitoso/fallido), `nombreArchivo`, y por fila el conteo (éxito) o el `motivoFallo` (fallo) — CA-02/03/04 | `apps/web/src/components/ListaIngestas.tsx`, `use-ingestas.ts`, `types.ts` |

## 3. Scope — OUT (non-goals)

- **`CANCELADA` / "cancelado"** — **fuera de alcance** (decisión de producto bloqueada). El
  historial cubre solo **exitoso (`PROCESADA`) / fallido (`FALLIDA`)**. No se agrega valor al
  enum `EstadoIngesta`, ni plumbing de aborto cliente/servidor (`AbortController`), ni concepto
  de cancelación. CA-02 se reinterpreta como exitoso/fallido, sin la tercera categoría del
  texto original de la US.
- **Revertir / re-procesar / re-descargar** un archivo del historial — no hay "deshacer" ni
  "volver a bajar el archivo". Borrar es competencia de US-018 (`DELETE /api/ingestas/:id`),
  no de esta US.
- **Filtros avanzados / búsqueda / paginación** — la lista es orden cronológico desc completo
  (CA-01), sin filtros por banco/estado/fecha ni paginado (YAGNI: sin requisito y sin volumen
  que lo justifique hoy).
- **Mobile** — solo web este sprint. `apps/mobile` no tiene UI de historial y **no se construye
  ahora** (deuda registrada; el foundation web ya existe, mobile sería greenfield).
- **Reconciliación de `PENDIENTE` huérfanos** — es un follow-up documentado aparte
  ("reconciliación de PR3"), no se resuelve aquí (ver §6, riesgo mitigado por el diseño elegido).

## 4. Recommended technical approach — la decisión de arquitectura

### 4.1 El blocker y las tres opciones

El pipeline resuelve `accountRepository.ensure(userId, banco)` **después** de detectar el banco.
Por tanto:

- **Fallos post-cuenta** (estructura, normalización, PDF, rango-fechas, dedupe, persistencia)
  ya tienen `accountId` → cubribles reusando el ciclo `PENDIENTE→FALLIDA` (Approach A).
- **Fallos pre-cuenta** (extensión, banco-no-reconocido) ocurren **antes** de que exista
  `accountId`. Con `Ingesta.accountId NOT NULL`, **A por sí sola NO puede registrarlos** — y la
  decisión bloqueada exige registrarlos.

- **A** (extender ciclo): bloqueada para los dos fallos tempranos por `accountId NOT NULL`.
- **B** (tabla `IntentoIngesta` separada, desacoplada de Account, escrita como primer paso):
  resuelve los tempranos, pero crea **dos fuentes de verdad para "una carga"** (Ingesta =
  éxito, tabla nueva = historial). El reader de `GET /api/ingestas` tendría que **mergear y
  ordenar dos tablas** de forma permanente en el hot path, más port+repo+use-case+DTO nuevos.
  Choca con DRY (el conocimiento "hubo una carga" queda en dos lugares) y con YAGNI (Ingesta ya
  modela el 90% del schema requerido: `nombreArchivo`, `estado`, `motivoFallo`,
  `totalTransacciones` — verificado en `schema.prisma`).
- **C** (relajar `accountId`/`banco` a nullable en Ingesta, crear la fila como paso 1):
  **fuente única de verdad**, encaja con la decisión bloqueada de "ensanchar in-place".

### 4.2 Recomendación: **Approach C, refinado con columna `userId` directa en Ingesta**

**Elijo C**, con una corrección obligatoria que la C ingenua omite:

> La C ingenua (solo nullable, conservar el aislamiento vía `account: { userId }`) está
> **ROTA**: una fila con `accountId = null` **no puede aislarse por usuario** a través del join
> `account.userId`, que es justo el mecanismo de RNF-SEC-006. Una fila de fallo temprano sin
> cuenta quedaría sin forma de scoping multi-tenant.

**La corrección: agregar una columna `userId` NO-NULL directa a `Ingesta`** (denormalizada desde
`account.userId`), y relajar `accountId`/`banco` a nullable. Entonces:

1. `input.userId` está disponible **desde el paso 0** del pipeline → toda fila puede crearse con
   aislamiento correcto **aunque el banco/cuenta aún no exista**.
2. El reader aísla por `where: { userId }` directo (más fuerte y simple que el join actual).
3. Invariante de dominio a documentar (y defender en application, KISS — no CHECK en Prisma,
   ver gotcha CLAUDE.md): **`estado = PROCESADA ⟹ accountId IS NOT NULL`**. El path de éxito
   siempre resuelve cuenta antes de persistir, así que PROCESADA nunca tiene `accountId` null.

### 4.3 Por qué C-refinado gana (blast radius medido, no asumido)

El punto que colapsa el "C tiene el mayor blast radius": **`Transaccion` tiene su PROPIO
`accountId NOT NULL`** (`schema.prisma:113`). **Todas** las vistas de dinero aíslan y agregan
vía `Transaccion.account: { userId }`, **nunca** vía `Ingesta.accountId`. Enumeración de cada
lector/uso de `Ingesta.accountId`/`Ingesta.banco` y cómo queda protegido:

| Lector / uso de `Ingesta.accountId`/`banco` | Impacto de nullable | Protección |
|---|---|---|
| `prisma-resumen-mes`, `prisma-movimientos-mes`, `prisma-detalle-bucket`, `prisma-resumen-anual`, categorización | **CERO** — leen `Transaccion.accountId`, no `Ingesta.accountId` | Las filas de fallo temprano **no tienen transacciones** → son estructuralmente invisibles a las vistas de dinero |
| `prisma-listar-ingestas.reader.ts` (el que reescribimos) | Cambia de `account:{userId}` a `userId` directo | Reescritura intencional de esta US |
| `prisma-eliminar-ingesta.repository.ts` (US-018 delete) | Scope padre vía `account:{userId}`; hijo vía `ingesta:{account:{userId}}` | PROCESADA (con cuenta) intacto. Borrar una fila FALLIDA temprana (sin cuenta, sin transacciones) queda como **pregunta abierta** (§7), no se rompe nada existente |
| `prisma-ingesta.repository.ts` (writer del ciclo) | Setea `accountId` en éxito | Sin cambio en el path de éxito; el nuevo path de fallo setea `userId` siempre y `accountId` cuando exista |
| `prisma-demo.repository.ts` / `demo-cleanup.service.ts` | Crean/borran con cuenta conocida | Controlados, siempre con cuenta |
| `banco` (String) — solo lo selecciona el listar reader | Nullable | Las vistas de dinero no leen `Ingesta.banco`; en el historial una fila temprana muestra banco desconocido (display, §7) |

Contra los principios: **KISS/DRY/YAGNI** favorecen la fuente única (C) sobre el merge
permanente de dos tablas (B); **Clean Arch (ADR-005)** intacta — `domain ← application ←
infrastructure`, la nullabilidad es modelado honesto (un intento fallido temprano *genuinamente*
no tiene cuenta), no un hack; **`Result<T,E>`** — el registro de fallo no lanza, retorna Result;
**RNF-SEC-006** queda **más fuerte** (userId directo, sin depender del join). **Scrub de montos**:
confirmado en explore — todos los `ProcessIngestaError.message` ya son storage-safe (no
interpolan valores crudos de celda/monto), así que `.message` se guarda como `motivoFallo`
**sin trabajo de scrub nuevo** (spot-check pendiente de `PdfSinTextoError`/`EstructuraPdfInvalidaError`, §7).

### 4.4 Cómo se escribe el registro de fallo (dirección, no tareas)

Recomendación **KISS**: registrar la fila **solo en el desenlace terminal**, no crear
`PENDIENTE` temprano para todos los paths. El orquestador ya tiene un `try/catch` en su
frontera `execute()`; centralizar allí un único "registrar intento fallido"
(`userId` siempre, + `nombreArchivo`/`banco`/`accountId` según lo que se haya resuelto,
`estado=FALLIDA`, `motivoFallo = error.message`) evita tocar las ~7 ramas internas de
`runPipeline` (DRY) **y** no prolifera filas `PENDIENTE` huérfanas (mitiga el riesgo #3 del
explore). El path de éxito conserva el `persist` actual sin cambios. Los mecanismos exactos
(dónde exactamente, si `nombreArchivo` está disponible al rechazar por extensión) son de la fase
de diseño.

## 5. Approach — resumen ejecutable

1. **Migración** (backend): `Ingesta` gana `userId String` (non-null, indexado), y
   `accountId`/`banco` pasan a nullable. Backfill de `userId` desde `account.userId` para filas
   existentes (todas PROCESADA con cuenta → backfilleable).
2. **Write-path**: registrar todo fallo terminal como fila `FALLIDA` con `userId`+`motivoFallo`
   (+ banco/cuenta si se resolvieron), centralizado en la frontera del orquestador.
3. **Read-path**: quitar `estado: PROCESADA`; aislar por `userId` directo; orden `creadoEn` desc
   (CA-01, ya existe); ensanchar port + DTO con `nombreArchivo`/`estado`/`motivoFallo`.
4. **Web**: `ListaIngestas.tsx` muestra estado + nombreArchivo + (conteo | motivo). Sin filtros,
   sin paginación.

## 6. Impact / risks

- **Regresión US-018 (mismo endpoint)**: la lista pasa a devolver un **superset** (ahora también
  FALLIDA). El cambio de DTO es **aditivo** (se conservan `id`, `banco`, `fecha`,
  `totalTransacciones`) → las lecturas existentes no rompen a nivel de tipo. **Guard conductual**:
  (a) el botón/afford de borrar de US-018 debe **gatearse por `estado`** (no ofrecer borrar una
  fila FALLIDA como si tuviera transacciones), y (b) el copy "N transacciones serán eliminadas"
  debe tolerar `0`/null. El cambio de aislamiento (account-join → userId directo) devuelve el
  **mismo conjunto** de PROCESADA para el usuario (equivalente) + las FALLIDA nuevas → sin
  regresión de aislamiento; el int-test de dos usuarios de US-018 sigue válido.
- **Migración sobre datos reales de prod**: la columna `userId` non-null exige backfill
  supervisado (patrón como el backfill de cifrado ADR-013). Mitigación: migración en dos fases
  (add nullable → backfill desde `account.userId` → set non-null); relajar accountId/banco es
  puro widening sin cambio de datos (seguro).
- **`PENDIENTE` huérfanos** (riesgo #3 del explore, "reconciliación de PR3"): **mitigado por
  diseño** — al registrar solo en el desenlace terminal (§4.4) no se prolifera `PENDIENTE`; un
  crash a mitad de pipeline deja cero fila (igual que hoy), no una fila colgada. La
  reconciliación queda como follow-up separado.
- **Nullable debilita la seguridad de vistas de dinero**: **mitigado** — money views aíslan vía
  `Transaccion.accountId`; invariante `PROCESADA ⟹ accountId NOT NULL`; filas tempranas sin
  transacciones son invisibles a esas vistas.

## 7. Open questions (para spec/design)

1. **Ciclo exacto de estados**: ¿registrar solo en desenlace terminal (recomendado §4.4) o crear
   `PENDIENTE` temprano y actualizar? Afecta el riesgo de huérfanos.
2. **Display de fallo temprano**: ¿`banco = null` se muestra como "desconocido"? ¿`nombreArchivo`
   está disponible al rechazar por extensión inválida (¿lo expone el `IFileReader` antes de
   validar)?
3. **US-018 sobre filas FALLIDA**: ¿se ofrece borrar una fila de fallo (sin transacciones) desde
   "Gestionar cartolas", o queda no-borrable / follow-up?
4. **Enforcement del invariante** `PROCESADA ⟹ accountId NOT NULL`: ¿solo en application (KISS) o
   CHECK por SQL puro (Prisma no modela CHECK — gotcha CLAUDE.md)?
5. **Scrub**: spot-check final de `PdfSinTextoError` y `EstructuraPdfInvalidaError.message`
   (siguen el patrón storage-safe; confirmar en spec).

## 8. Delivery note (no es planificación de tareas)

Cambio **backend-heavy** (migración de schema + write-path de registro de fallos + reescritura
reader/DTO) **+** un cambio web menor. La combinación probablemente **excede el presupuesto de
400 líneas** (ADR-020/030). Split probable: **Slice 1 backend** (migración + registro de fallos +
reader/DTO ensanchado + int-test de aislamiento por `userId` RNF-SEC-006) y **Slice 2 web**
(render de estado/motivo/nombreArchivo en `ListaIngestas`). La estrategia de PRs
(stacked-to-main vs feature-branch-chain) la decide `sdd-tasks` según `delivery_strategy`/
`chain_strategy`. **No se planifican tareas aquí.**
