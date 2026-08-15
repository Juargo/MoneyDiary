# Changelog

## [0.2.0](https://github.com/Juargo/MoneyDiary/compare/mobile-v0.1.0...mobile-v0.2.0) (2026-08-15)


### Features

* **api:** explicit Google account linking and unlinking (US-041) ([a06f4a7](https://github.com/Juargo/MoneyDiary/commit/a06f4a762af4f66de04da50942371670e16dbda3))
* **api:** profile editing API — nombre, email and password (US-040) ([54a2462](https://github.com/Juargo/MoneyDiary/commit/54a2462242ded6c2f18f3186a59e74cca1f45d1a))
* link state on the identity read (US-041 PR 1/3) ([5de2aed](https://github.com/Juargo/MoneyDiary/commit/5de2aede1849169920239187c1db56b8bea37849))
* **mobile:** "Ingresar con Google" button on login screen (slice C2) ([fc7c0e1](https://github.com/Juargo/MoneyDiary/commit/fc7c0e1bf88020bab92f7739e9bc12f5c397cfb3))
* **mobile:** add @moneydiary/api-client workspace dependency ([fd455ee](https://github.com/Juargo/MoneyDiary/commit/fd455ee2762933a443b0c9f4155bc1e16a4e0688))
* **mobile:** add expo-auth-session deps and OAuth redirect scheme ([599b05d](https://github.com/Juargo/MoneyDiary/commit/599b05d8794c65fd0a83c32ef915b83a5d87370b))
* **mobile:** add GOOGLE_CLIENT_ID_ANDROID config export ([e62ec40](https://github.com/Juargo/MoneyDiary/commit/e62ec4038ef0bd33d72dba412aaf33fd58d87032))
* **mobile:** add GoogleLoginButton presentational component ([5661c39](https://github.com/Juargo/MoneyDiary/commit/5661c391c9aea3e643594d3b728aded29ca472bc))
* **mobile:** add postGoogleIdToken and fetchAuthCapabilities ([a286e23](https://github.com/Juargo/MoneyDiary/commit/a286e230e2aab08a5f2e7a1d40759041e2885dda))
* **mobile:** add useGoogleIdToken transport hook ([e90e370](https://github.com/Juargo/MoneyDiary/commit/e90e370add341ec035992dd0476d696c0736a9ad))
* **mobile:** adopt @moneydiary/api-client generated types (api-client-package slice 3) ([d15e22b](https://github.com/Juargo/MoneyDiary/commit/d15e22b1b836d5a8de0ef45cd07823203a508fbb))
* **mobile:** alias DTO types to @moneydiary/api-client ([d344ab4](https://github.com/Juargo/MoneyDiary/commit/d344ab4b377b011200b3c09052e1a0490904a138))
* **mobile:** configure Android OAuth client id in EAS build profiles ([b2c3e0b](https://github.com/Juargo/MoneyDiary/commit/b2c3e0bd3fbb214bf451d95bfc543d2e45bb628f))
* **mobile:** enable verbatimModuleSyntax type-erasure guarantee ([fd43ece](https://github.com/Juargo/MoneyDiary/commit/fd43ece50473e51d2392fd441b0de7bdc57b9e5a))
* **mobile:** Google login transport layer (slice C1) ([1648b3b](https://github.com/Juargo/MoneyDiary/commit/1648b3b3b7916094155d1f8be09d9fc39e9e2e46))
* **mobile:** orchestrate Google sign-in in app/login.tsx (MOB-06) ([724f160](https://github.com/Juargo/MoneyDiary/commit/724f160dc96a1ba0352765e87c98a5ee484a00fb))
* **mobile:** wire optional Google affordance into LoginScreen ([260b957](https://github.com/Juargo/MoneyDiary/commit/260b95795cd08b099dded782d863a29f56f6e4a7))


### Bug Fixes

* **mobile:** bound Google sign-in network legs with a client-side timeout ([d754e0b](https://github.com/Juargo/MoneyDiary/commit/d754e0bc6b9d8a6ff36d5b95538cab0b86b72f33))
* **mobile:** use reversed-client-id redirect scheme (C2.8 contingency) ([83f7142](https://github.com/Juargo/MoneyDiary/commit/83f714207a20fac54ddf5089795513929f6ae9a5))
