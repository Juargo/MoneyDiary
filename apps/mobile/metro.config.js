const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Keep test files out of the Metro bundle. Expo Router treats every file under
// app/ as a route, so a co-located app/*.spec.tsx would be bundled — pulling in
// @testing-library/react-native (a dev-only dep) and failing to resolve. Jest
// uses its own config, so this only affects the app bundle, not the test run.
const existingBlockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]
  : [];
config.resolver.blockList = [...existingBlockList, /.*\.(spec|test)\.[jt]sx?$/];

module.exports = withNativeWind(config, { input: './global.css' });
