// Jest never runs the app through Metro, so NativeWind's CSS import
// (`import '../global.css'` in `app/_layout.tsx`) has no transformer able to
// parse it under babel-jest. Real CSS→style processing only ever happens via
// Metro's `withNativeWind` (see metro.config.js) — irrelevant to Jest, which
// only needs the import to resolve to something harmless. Mapped via
// `moduleNameMapper` in jest.config.js.
module.exports = {};
