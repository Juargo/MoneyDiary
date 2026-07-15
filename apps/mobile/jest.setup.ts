// Matchers de React Native Testing Library (`toBeOnTheScreen`,
// `toHaveTextContent`, ...) vienen built-in en RNTL desde v12.4 y REEMPLAZAN
// al paquete deprecado `@testing-library/jest-native` que menciona ADR-017.
//
// A partir de RNTL v14 ya no existe el subpath `/extend-expect`: los
// matchers se registran automáticamente con cualquier import del paquete
// principal (`render`, `screen`, ...) en el archivo de test — no requieren
// setup explícito. Verificado contra el paquete instalado
// (@testing-library/react-native@14.0.1, T2.8, sprint3-mvp-mobile).
// Este archivo queda como punto de extensión futuro para setup global.
export {};
