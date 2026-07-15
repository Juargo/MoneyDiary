// babel-preset-expo es requerido por jest-expo para transpilar RN/JSX en tests
// (y por Metro en runtime). El `jsxImportSource: 'nativewind'` hace que el
// jsx-transform de expo use el runtime de NativeWind — sin esto, en NATIVO el
// transform de expo (importSource "react") gana y el prop `className` nunca
// llega al interop, así que los estilos no aplican en device (aunque en web sí,
// porque web usa el pipeline CSS). "nativewind/babel" agrega el plugin css-interop
// + worklets. Config canónico NativeWind v4 + Expo (B.4, sprint3-mvp-mobile).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
