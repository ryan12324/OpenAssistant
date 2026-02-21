import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/app/api/**/*.ts",
        "src/middleware.ts",
        "src/instrumentation.ts",
      ],
      exclude: [
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/**/*.d.ts",
        // Pure type definitions (no runtime code)
        "src/lib/agents/types.ts",
        "src/lib/integrations/types.ts",
        "src/lib/mcp/types.ts",
        "src/lib/rag/types.ts",
        "src/lib/skills/types.ts",
        // Pure re-exports (no runtime logic)
        "src/lib/agents/index.ts",
        "src/lib/integrations/index.ts",
        "src/lib/mcp/index.ts",
        // Client-side module (requires React/browser environment)
        "src/lib/auth-client.ts",
      ],
    },
  },
});
