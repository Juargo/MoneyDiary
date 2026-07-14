/// <reference types="nativewind/types" />

// `nativewind/types` augments RN component props (className) but does not
// declare CSS imports as a module — TS needs this ambient declaration for
// the side-effect `import './global.css'` in app/_layout.tsx (T2.6,
// sprint3-mvp-mobile).
declare module '*.css' {
  const content: string;
  export default content;
}
