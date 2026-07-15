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

  clean: true,
  runtime: "node",
  failOnWarn: false,
  transformer,
});
