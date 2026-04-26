import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
  },
  {
    entry: { cli: "src/cli/main.ts" },
    format: ["esm"],
    target: "es2022",
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    entry: { lsp: "src/lsp/server.ts" },
    format: ["esm"],
    target: "es2022",
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
