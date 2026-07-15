import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
  clean: true,
  runtime: "node",
  validation: false,
  failOnWarn: false,
  transformer,
});
