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
const config = [
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
  {
    rules: {
      // ── Downgraded to warn, with reasons ────────────────────────────────────
      //
      // Reading localStorage in a mount effect and calling setState is the SSR-safe
      // way to hydrate client state in this app: localStorage does not exist while the
      // component renders on the server, and reading it during render would produce a
      // hydration mismatch. All ~38 reports are that one pattern
      // (`useEffect(() => setX(loadX()), [])`), which is deliberate — the cascade is
      // exactly one extra render on mount and is inherent to the approach.
      //
      // Kept as a WARNING rather than off, because the rule would legitimately catch a
      // real cascading-render bug in the canvas, where this codebase has a documented
      // history of React error #185 infinite loops (see docs/canvas-wizard.md). A new
      // report here is worth reading before dismissing: check whether it is the
      // hydration pattern or something that actually loops.
      //
      // The principled fix is useSyncExternalStore, which is a rewrite of the app's
      // whole localStorage + KV hydration layer, not a lint cleanup.
      "react-hooks/set-state-in-effect": "warn",

      // react-hook-form is flagged as incompatible with the React Compiler (one report,
      // ArticleForm's useFieldArray). Informational — the compiler is not enabled
      // (`reactCompiler` is not set in next.config.mjs), and dropping react-hook-form is
      // not on the table. Revisit only if reactCompiler is ever turned on.
      "react-hooks/incompatible-library": "warn",
    },
  },
];

export default config;
