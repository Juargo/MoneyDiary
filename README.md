# MoneyDiary

<img width="1195" height="695" alt="Dashboard de MoneyDiary" src="https://github.com/user-attachments/assets/744f3143-5170-4f0a-b94c-20b8ff62f3f7" />

Aplicación de finanzas personales para consolidar y analizar movimientos bancarios chilenos.

- **Web:** [app.moneydiary.cl](https://app.moneydiary.cl) · **Landing:** [moneydiary.cl](https://moneydiary.cl) · **API:** `api.moneydiary.cl`
- **Repositorio:** [github.com/Juargo/MoneyDiary](https://github.com/Juargo/MoneyDiary)

## Índice

1. [Descripción general](#1-descripción-general)
2. [Stack tecnológico](#2-stack-tecnológico)
3. [Instalación y ejecución](#3-instalación-y-ejecución)
4. [Estructura del proyecto](#4-estructura-del-proyecto)
5. [Funcionalidades principales](#5-funcionalidades-principales)
6. [Usuario y contraseña de prueba](#6-usuario-y-contraseña-de-prueba)
7. [Calidad, pruebas y seguridad](#7-calidad-pruebas-y-seguridad)
8. [Documentación adicional](#8-documentación-adicional)

---

## 1. Descripción general

MoneyDiary permite importar las cartolas (extractos) de los principales bancos chilenos —Banco de Chile, BancoEstado, BCI y Santander— desde archivos `.xlsx` y `.pdf`, unificarlas en un único libro de movimientos y analizarlas con el método de presupuesto **50/30/20**:

| Bucket | Porcentaje objetivo del ingreso |
|---|---|
| Necesidades | 50 % |
| Deseos | 30 % |
| Ahorro | 20 % |

El objetivo es responder de un vistazo a la pregunta *"¿estoy bien este mes?"* mediante un **semáforo** verde / amarillo / rojo por bucket.

Flujo principal:

```
cargar cartola (xlsx / pdf / manual) → detectar banco → validar → normalizar
→ vista previa y confirmación → persistir (cifrado) → categorizar
→ consolidar por mes → resumen 50/30/20 + semáforo + detalle
```

El proyecto es además un ejercicio de ingeniería de software aplicada: Clean Architecture, TDD, decisiones de arquitectura documentadas como ADRs (`docs/adr/`), desarrollo guiado por especificaciones (`openspec/`) y gestión ágil con Scrum sobre GitHub Issues y Milestones.

## 2. Stack tecnológico

Monorepo gestionado con **pnpm workspaces** (`pnpm@11.24.0`) sobre **Node.js 22** (`.node-version`: `22.22.3`), escrito íntegramente en **TypeScript** en modo estricto.

| Aplicación | Tecnologías principales |
|---|---|
| **API** (`apps/api`) | Express 5 · Prisma 7 · PostgreSQL 16 (Supabase en producción) · Zod 4 + zod-openapi (contrato OpenAPI) · ExcelJS y pdfjs-dist (lectura de cartolas) · argon2 (hash de contraseñas) · Google OAuth (openid-client, google-auth-library) · Pino (logging) |
| **Web** (`apps/web`) | React 19 · Vite 8 · Tailwind CSS 4 · shadcn/ui (Radix UI) · TanStack Router · TanStack Query · Zustand |
| **Mobile** (`apps/mobile`) | Expo SDK 57 · React Native 0.86 · Expo Router · NativeWind |
| **Landing** (`apps/landing`) | Astro 7 · Tailwind CSS 4 |
| **Cliente de API** (`packages/api-client`) | Tipos generados desde `apps/api/openapi.json` con openapi-typescript |

**Pruebas:** Vitest (API y web) · Playwright (e2e web) · Jest + jest-expo + React Native Testing Library (mobile) · Maestro (e2e mobile).

**Infraestructura y CI/CD:** GitHub Actions (CI, CodeQL, release-please, release mobile) · Render (API) · Vercel (web y landing) · Supabase (PostgreSQL) · EAS (builds mobile) · Docker (base de datos local).

## 3. Instalación y ejecución

### Requisitos previos

- Node.js 22 y pnpm 11 (`corepack enable` activa la versión declarada en `package.json`).
- Docker, para levantar PostgreSQL local. Alternativa sin Docker: PostgreSQL 16 con Homebrew (ver [`apps/api/docs/local-test-db.md`](./apps/api/docs/local-test-db.md)).
- OpenSSL, para generar la clave de cifrado.

### 1) Clonar e instalar dependencias

```bash
git clone git@github.com:Juargo/MoneyDiary.git
cd MoneyDiary
pnpm install
```

En una instalación limpia, pnpm puede pedir aprobar los scripts de build de `@prisma/engines`, `prisma`, `@swc/core` y `unrs-resolver` (`pnpm approve-builds`).

### 2) Levantar la base de datos local

```bash
pnpm api db:up        # PostgreSQL 16 en Docker, localhost:5432 (base moneydiary_test)
```

### 3) Configurar variables de entorno

Las plantillas de cada aplicación están en su `.env.example`. Para desarrollo local se necesitan dos archivos en `apps/api` (ambos ignorados por git):

**`apps/api/.env.test`** — usado por migraciones, seed y pruebas de integración:

```dotenv
DATABASE_URL=postgresql://moneydiary:moneydiary@localhost:5432/moneydiary_test
DIRECT_URL=postgresql://moneydiary:moneydiary@localhost:5432/moneydiary_test
ENCRYPTION_KEY=<salida de: openssl rand -base64 32>
API_KEY=local-api-key-not-a-secret-0000000000
COOKIE_SECURE=false
SEED_USER_EMAIL=test@moneydiary.local
SEED_USER_PASSWORD=local-test-password-123
```

**`apps/api/.env`** — usado por el servidor de desarrollo. Mismos valores de `DATABASE_URL`, `DIRECT_URL`, `ENCRYPTION_KEY`, `API_KEY` y `COOKIE_SECURE` (la `ENCRYPTION_KEY` **debe** ser la misma que usó el seed, o los datos no se podrán descifrar).

**`apps/web/.env.local`** — la misma `API_KEY`. El servidor de Vite la inyecta en el proxy `/api`; nunca llega al navegador.

```dotenv
API_KEY=local-api-key-not-a-secret-0000000000
```

> Por seguridad, en desarrollo la API solo acepta bases de datos en `localhost` y rechaza cualquier URL que parezca de producción.

### 4) Migrar y poblar la base de datos

```bash
pnpm api test:db:setup    # aplica las migraciones de Prisma y ejecuta el seed (crea el usuario de prueba)
```

### 5) Ejecutar las aplicaciones

```bash
pnpm api dev              # API Express en http://localhost:3000 (recarga al guardar)
pnpm web dev              # Web en http://localhost:5173 (proxy /api → :3000)
pnpm landing dev          # Landing Astro
```

Mobile (requiere `apps/mobile/.env` con `EXPO_PUBLIC_API_BASE_URL` y `EXPO_PUBLIC_API_KEY`, ver `apps/mobile/.env.example`):

```bash
cd apps/mobile && npx expo start
```

Abrir http://localhost:5173, iniciar sesión con el [usuario de prueba](#6-usuario-y-contraseña-de-prueba) y subir una cartola de ejemplo desde `apps/api/test/fixtures/` (por ejemplo `movimientos-test.xlsx`).

### Comandos útiles

```bash
pnpm test                                         # pruebas unitarias de todos los workspaces
pnpm build                                        # build de todos los workspaces
pnpm api test:integration                         # integración contra PostgreSQL local
pnpm api test:e2e                                 # e2e HTTP de la API contra PostgreSQL local
pnpm web test:e2e                                 # e2e web con Playwright
pnpm --filter @moneydiary/mobile test             # pruebas mobile (jest-expo)
pnpm api cli -- ./test/fixtures/movimientos-test.xlsx   # pipeline de ingesta por línea de comandos
pnpm contract:sync                                # regenera openapi.json y el cliente tipado
pnpm api db:down                                  # apaga la base de datos local
```

## 4. Estructura del proyecto

```
MoneyDiary/
├── apps/
│   ├── api/               # Backend Express — Clean Architecture
│   │   ├── prisma/        # esquema, migraciones y seed
│   │   ├── src/
│   │   │   ├── domain/          # entidades, value objects, errores y eventos (sin dependencias externas)
│   │   │   ├── application/     # casos de uso, puertos (interfaces), servicios y DTOs
│   │   │   ├── infrastructure/  # adaptadores: HTTP (Express), Prisma, Excel, PDF, OAuth, logging, CLI
│   │   │   ├── composition/     # composition root: ensambla el grafo de dependencias
│   │   │   ├── config/          # validación de variables de entorno
│   │   │   └── shared/          # Result<T, E> y utilidades transversales
│   │   ├── test/          # pruebas de integración/e2e y fixtures de cartolas reales anonimizadas
│   │   └── openapi.json   # contrato HTTP canónico
│   ├── web/               # SPA React (rutas en src/routes)
│   ├── mobile/            # App Expo (pantallas en app/)
│   └── landing/           # Sitio estático Astro
├── packages/
│   └── api-client/        # tipos TypeScript generados desde openapi.json
├── docs/
│   ├── adr/               # decisiones de arquitectura (ADR-001 … ADR-045)
│   └── *.md               # runbooks operativos
├── openspec/              # especificaciones (SDD): specs vigentes y cambios archivados
├── odd/                   # seguimiento de tareas de desarrollo
├── scripts/               # scripts de soporte del monorepo
├── .github/workflows/     # CI, CodeQL, release-please, release mobile
└── render.yaml            # despliegue de la API en Render
```

**Regla de dependencias del backend:** `domain ← application ← infrastructure`, nunca al revés. El dominio y la aplicación no lanzan excepciones: devuelven `Result<T, E>`. El frontend no importa el dominio del backend; el contrato entre ambos es el OpenAPI.

## 5. Funcionalidades principales

- **Autenticación:** inicio de sesión con email y contraseña (hash argon2id) o con Google, sesión mediante cookie `HttpOnly`, límite de intentos por email e IP, y cambio de contraseña y vinculación de cuenta Google desde el perfil.
- **Importación de cartolas:** carga de archivos `.xlsx` (Banco de Chile, BancoEstado, BCI, Santander) y `.pdf` (Banco de Chile, Santander) con detección automática del banco, validación, normalización, **vista previa** editable y confirmación antes de guardar. Historial de importaciones con opción de eliminarlas.
- **Registro manual** de movimientos, además de edición y eliminación.
- **Categorización automática** por reglas (patrones de texto) sobre un **catálogo de categorías propio de cada usuario**, agrupado en los buckets Necesidades / Deseos / Ahorro. Reclasificación manual y reevaluación de movimientos al cambiar reglas.
- **Resumen mensual 50/30/20:** gasto real frente al objetivo de cada bucket, con navegación por mes y vista anual.
- **Semáforo** verde / amarillo / rojo por bucket para saber de inmediato si el mes va bien.
- **Detalle por bucket y por ingresos:** lista de movimientos del mes agrupada por categoría.
- **Configuración:** gestión de categorías (nombre, bucket e ícono) y de reglas de clasificación.
- **Privacidad:** descripciones de movimientos, números de cuenta y emails cifrados en reposo (AES-256-GCM); cada usuario solo accede a sus propios datos.
- **Multiplataforma:** la misma funcionalidad en la web responsive y en la app mobile (Android).

## 6. Usuario y contraseña de prueba

La aplicación tiene login con email y contraseña (además de Google y de un modo demo).

### Producción — [app.moneydiary.cl](https://app.moneydiary.cl)

| Campo | Valor |
|---|---|
| Email | `test_tfm@moneydiary.cl` |
| Contraseña | `AhdD2McW&ZJ7X@` |

Es una cuenta de evaluación, aislada del resto de los usuarios, con acceso completo (importar cartolas, categorizar, ver resúmenes). Para probar la importación se pueden usar las cartolas de ejemplo de `apps/api/test/fixtures/`.

### Entorno local

El seed crea un usuario de prueba (paso 4 de la instalación):

| Campo | Valor |
|---|---|
| Email | `test@moneydiary.local` |
| Contraseña | `local-test-password-123` |

Las credenciales salen de `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` en `apps/api/.env.test`; si se cambian allí, el seed crea el usuario con los nuevos valores.

## 7. Calidad, pruebas y seguridad

- **TDD** y pirámide de pruebas: unitarias de dominio (dinero, redondeo, 50/30/20), integración contra PostgreSQL real, e2e HTTP, e2e web en tres viewports (móvil, tablet, escritorio) y accesibilidad con `vitest-axe`.
- **Dinero exacto:** montos en `BigInt` (pesos chilenos), nunca `float`, con restricciones `CHECK` en la base de datos.
- **Aislamiento multiusuario:** todas las consultas filtran por `userId`, con pruebas de integración que verifican que un usuario no ve datos de otro.
- **CI:** typecheck, lint, pruebas, auditoría de dependencias, escaneo de secretos y CodeQL en cada PR.
- **Cadena de suministro:** pnpm con `minimum-release-age`, `audit-level=high` y `block-exotic-subdeps`.
- **Protección de la base de datos:** las operaciones destructivas requieren `ALLOW_DESTRUCTIVE_DB=1` y rechazan conexiones de producción.

## 8. Documentación adicional

- [`docs/adr/`](./docs/adr/) — las 45 decisiones de arquitectura, con índice en [`docs/adr/README.md`](./docs/adr/README.md) y estado de implementación en [`docs/adr/estado-implementacion.md`](./docs/adr/estado-implementacion.md).
- [`CLAUDE.md`](./CLAUDE.md) — arquitectura, convenciones de código y detalles técnicos del repositorio.
- [`apps/api/README.md`](./apps/api/README.md) — modo de usuario y seguridad de la base de datos.
- [`openspec/`](./openspec/) — especificaciones funcionales.
- [GitHub Issues](https://github.com/Juargo/MoneyDiary/issues) y [Milestones](https://github.com/Juargo/MoneyDiary/milestones) — backlog de User Stories y sprints.
