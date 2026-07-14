// babel-preset-expo es requerido por jest-expo para transpilar RN/JSX en tests
// (y por Metro en runtime). "nativewind/babel" habilita el className -> style
// transform de NativeWind v4 (B.4, sprint3-mvp-mobile).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
  };
};
