import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Flat config, required from ESLint 9 / eslint-config-next 16 — the old .eslintrc.json
// format is dropped in ESLint 10. `next lint` was also removed in Next 16, so linting now
// runs through the ESLint CLI (`npm run lint`) and `next build` no longer lints as a side
// effect. If you want lint enforced before a deploy, it has to be an explicit step.
//
// eslint-config-next 16 exports real flat-config arrays, so they spread in directly. Do
// NOT wrap these in FlatCompat: the compat layer round-trips the config through
// JSON.stringify and the plugin object is self-referential, which throws
// "Converting circular structure to JSON" before any file is linted.
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/ffmpeg/**", // ~31 MB of generated WASM, copied in by prebuild
      "scripts/.*.mjs", // esbuild bundles of the one-off scripts
    ],
  },
  ...coreWebVitals,
  ...typescript,
];
