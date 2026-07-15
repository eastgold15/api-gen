import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/oxc";
export default defineConfig({
  entries: [
    {
      input: "./src/index.ts",
      name: "index",
      executable: true,
    },
  ],
  outDir: "./dist",
  clean: true,
  declaration: false,
  sourcemap: false,
  runtime: "node",
  transformer,
  failOnWarn: false,
});
