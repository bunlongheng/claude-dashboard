import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // Enforced floors (CI runs this via `npm run test:coverage`). The global
      // floor covers everything in `include`; each glob ratchets on its own so
      // lib stays strict while routes and sections climb from their measured
      // baseline (2026-09-25: lib 98/96/91/98, api 71/67/49/64, sections 14/13/12/12).
      // Ratchet up as coverage improves; never let it drop below these.
      thresholds: {
        lines: 43, statements: 41, branches: 27, functions: 27,
        "lib/**": { lines: 97, statements: 95, branches: 90, functions: 97 },
        "app/api/**": { lines: 70, statements: 66, branches: 47, functions: 63 },
        "app/**/_sections/**": { lines: 13, statements: 12, branches: 11, functions: 11 },
      },
      include: [
        "lib/**/*.ts",
        "app/api/**/route.ts",
        "app/**/_sections/**/*.ts",
        "app/**/_sections/**/*.tsx",
      ],
      exclude: [
        "**/*.d.ts",
        "lib/db/types.ts", // interfaces only, no runtime code
        // Excluded from UNIT coverage with reason: these require external
        // services or live OS state and are covered at the integration/E2E layer.
        "lib/rag-extract-insights.ts", // needs ANTHROPIC_API_KEY (LLM call)
        "lib/rag-extract-preferences.ts", // needs ANTHROPIC_API_KEY (LLM call)
        "lib/rag-ingest.ts", // filesystem ingestion of ~/.claude (integration)
        "lib/rag-ingest-sessions.ts", // filesystem ingestion of ~/.claude (integration)
        "lib/live-sessions.ts", // needs lsof + live `claude` processes
        "lib/db/sqlite.ts", // optional remote-DB adapter, env-gated
        "lib/db/index.ts", // adapter selection wiring, env-gated
        "lib/db/noop.ts", // fallback no-op adapter, env-gated
        "lib/ui-tokens.ts", // presentational style tokens/helpers, exercised via components + E2E
        "lib/eval/embeddings.ts", // optional transformers.js model (integration, opt-in)
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
