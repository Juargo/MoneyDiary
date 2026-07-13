// babel-preset-expo es requerido por jest-expo para transpilar RN/JSX en tests
// (y por Metro en runtime). Se instala con el scaffolding de la app real.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
