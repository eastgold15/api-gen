import { describe, it, expect } from "bun:test";
import { LAYERS } from "../utils/tree-builder.js";

describe("LAYERS 数组(tradeflow 约定)", () => {
  it("包含 controller / service / repos / dbschema / tbschema / relation", () => {
    expect(LAYERS).toContain("controller");
    expect(LAYERS).toContain("service");
    expect(LAYERS).toContain("repos");
    expect(LAYERS).toContain("dbschema");
    expect(LAYERS).toContain("tbschema");
    expect(LAYERS).toContain("relation");
  });

  it("不再包含旧 layout 的 schema / contract", () => {
    expect(LAYERS).not.toContain("schema");
    expect(LAYERS).not.toContain("contract");
  });

  it("6 个 layer(已废弃的不算)", () => {
    expect(LAYERS.length).toBe(6);
  });
});
