import { defineConfig } from "vitest/config";

// .mts, not .ts: Vite's native config loader treats a bare .ts config as CommonJS and
// warns about the ESM `import` above.
export default defineConfig({
  // Resolves the `@/*` -> `./src/*` alias from tsconfig.json, so tests can import the
  // same way application code does. Done natively rather than via vite-tsconfig-paths.
  resolve: { tsconfigPaths: true },
  test: {
    // These are pure-function tests. Anything needing DOM APIs should set its own
    // environment with a `// @vitest-environment jsdom` docblock rather than slowing
    // this suite down for every file.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
