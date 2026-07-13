# @moneydiary/mobile — esqueleto de testing (post-MVP)

App mobile de MoneyDiary: **React Native + Expo** (ADR-010). Esta carpeta es,
por ahora, **solo el esqueleto del arnés de pruebas** definido en
[ADR-017](../../README.md) — no es todavía una app Expo funcional y **no forma
parte del `pnpm workspace`** (está excluida en `pnpm-workspace.yaml`).

## ¿Por qué excluida del workspace?

Incluirla obligaría a `pnpm install` a resolver e instalar todo el árbol de
React Native / Expo **antes de tiempo**. ADR-010 y ADR-017 son explícitos:
mobile es post-MVP y las versiones exactas (Expo SDK, RN, `jest-expo`,
`react-test-renderer`) **se fijan al scaffoldear la app real**, para que no
envejezcan. Hasta entonces, mantener este esqueleto fuera del install deja
`pnpm install` y `pnpm audit` sanos en el resto del monorepo.

## Stack de testing (ADR-017)

| Capa | Herramienta | Correlato web (ADR-016) |
|---|---|---|
| Unit (dominio/lógica) | **Jest** + preset **`jest-expo`** | Vitest |
| Componentes / UI | **React Native Testing Library** | @testing-library/react |
| E2E | **Maestro** (flujos YAML) | Playwright |

## Estructura

```
apps/mobile/
  package.json          scripts test / test:watch / test:cov / e2e
  jest.config.js        preset jest-expo + setup
  jest.setup.ts         matchers RNTL (extend-expect)
  babel.config.js       babel-preset-expo (requerido por jest-expo)
  tsconfig.json         extends expo/tsconfig.base
  src/
    domain/             unidad de dominio pura (Jest directo) — ejemplo dinero
    components/         componente RN + spec con RNTL — ejemplo
  .maestro/             flujos E2E: login, ver-movimientos, resumen-semaforo
```

## Nota sobre matchers (desviación deliberada de ADR-017)

ADR-017 lista `@testing-library/jest-native` para los matchers de RN. **Ese
paquete está DEPRECADO**: sus matchers vienen built-in en
`@testing-library/react-native` v12.4+. Este esqueleto usa el enfoque moderno
(`import '@testing-library/react-native/extend-expect'` en `jest.setup.ts`) y
**no** instala `@testing-library/jest-native`. Recomendado: actualizar ADR-017
para reflejarlo.

## Activar mobile (post-MVP)

1. Scaffoldear la app Expo real sobre esta carpeta (`create-expo-app` / template
   con Expo Router — ADR-010), reconciliando versiones con el Expo SDK elegido.
2. Quitar la línea `- '!apps/mobile'` de `pnpm-workspace.yaml`.
3. `pnpm install` desde la raíz.
4. `pnpm --filter @moneydiary/mobile test` → Jest + RNTL.
5. **Maestro** (E2E) se instala aparte (CLI, no es dep npm) y corre contra un
   development build sobre simulador/emulador o dispositivo:
   `pnpm --filter @moneydiary/mobile e2e`.

> Detox NO se adopta en el MVP mobile; queda como escalada si Maestro resulta
> insuficiente para sincronización fina (ADR-017).
