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
      thresholds: { lines: 100, statements: 100, branches: 100, functions: 100 },
      include: [
        "lib/**/*.ts",
        "app/**/_sections/shared.tsx",
        "app/**/_sections/sectionColors.ts",
        "app/**/_sections/AppIcon.tsx",
      ],
      exclude: [
        "**/*.d.ts",
        "lib/db/types.ts", // interfaces only, no runtime code
        // Excluded from UNIT coverage with reason: these require external
        // services or live OS state and are covered at the integration/E2E layer.
        "lib/rag-extract-insights.ts", // needs ANTHROPIC_API_KEY (LLM call)
        "lib/rag-extract-preferences.ts", // needs ANTHROPIC_API_KEY (LLM call)
        "lib/rag-compile.ts", // needs ANTHROPIC_API_KEY (LLM call)
        "lib/rag-ingest.ts", // filesystem ingestion of ~/.claude (integration)
        "lib/rag-ingest-sessions.ts", // filesystem ingestion of ~/.claude (integration)
        "lib/live-sessions.ts", // needs lsof + live `claude` processes
        "lib/db/sqlite.ts", // optional remote-DB adapter, env-gated
        "lib/db/index.ts", // adapter selection wiring, env-gated
        "lib/db/noop.ts", // fallback no-op adapter, env-gated
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
