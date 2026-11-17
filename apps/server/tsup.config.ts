import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/db/migrate.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (shipped as TS source); keep real deps external.
  noExternal: ["@sweep/shared"],
});
