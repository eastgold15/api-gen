import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout } from "../structure/detector.js";

const TMP_ROOT = resolve(import.meta.dir, "../../.test-tmp");

// -----------------------------------------------------------------------
// 测试：单仓库结构
// -----------------------------------------------------------------------
describe("单仓库 (single-app)", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({ name: "test-project" }), "utf-8");

    // 业务文件直接在 src/ 下按分层后缀放
    mkdirSync(join(TMP_ROOT, "src"), { recursive: true });
    writeFileSync(join(TMP_ROOT, "src/user.controller.ts"), `
import { Elysia } from "elysia";
export const user = new Elysia({ prefix: "/users" })
  .get("/", () => "list", { detail: { summary: "用户列表", tags: ["user"] } });
`, "utf-8");
    writeFileSync(join(TMP_ROOT, "src/user.server.ts"), "// 业务逻辑", "utf-8");
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("识别项目名称", () => {
    expect(detectLayout(TMP_ROOT).projectName).toBe("test-project");
  });

  it("判断为单仓库", () => {
    expect(detectLayout(TMP_ROOT).isMonorepo).toBe(false);
  });

  it("生成一个 main 应用", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.apps.length).toBe(1);
    expect(config.apps[0]!.appName).toBe("main");
  });

  it("识别 controller / server 目录", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.apps[0]!.controllersDir).toContain("src");
    expect(config.apps[0]!.serverDir).toContain("src");
  });

  it("structureTree 包含分层文件 (controller/server)", () => {
    const tree = detectLayout(TMP_ROOT).structureTree;
    expect(tree).toContain("user.controller.ts");
    expect(tree).toContain("user.server.ts");
  });

  it("common 层为 null", () => {
    expect(detectLayout(TMP_ROOT).common).toBeNull();
  });

  it("AI 配置含默认值", () => {
    const ai = detectLayout(TMP_ROOT).ai;
    expect(ai.provider).toBe("deepseek");
    expect(ai.model).toBe("deepseek-chat");
  });
});

// -----------------------------------------------------------------------
// 测试：Monorepo 结构
// -----------------------------------------------------------------------
describe("Monorepo", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({ name: "mono-project" }), "utf-8");

    // packages/contract 公共层
    mkdirSync(join(TMP_ROOT, "packages/contract"), { recursive: true });
    writeFileSync(join(TMP_ROOT, "packages/contract/user.schema.ts"), 'export const userTable = {};', "utf-8");
    writeFileSync(join(TMP_ROOT, "packages/contract/user.relation.ts"), '', "utf-8");
    writeFileSync(join(TMP_ROOT, "packages/contract/user.contract.ts"), '', "utf-8");

    // apps/api 应用
    mkdirSync(join(TMP_ROOT, "apps/api/src"), { recursive: true });
    writeFileSync(join(TMP_ROOT, "apps/api/src/goods.controller.ts"), `
import { Elysia } from "elysia";
export const goods = new Elysia({ prefix: "/goods" })
  .get("/", () => "list", { detail: { summary: "商品列表", tags: ["goods"] } });
`, "utf-8");
    writeFileSync(join(TMP_ROOT, "apps/api/src/goods.server.ts"), '', "utf-8");
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("识别为 monorepo", () => {
    expect(detectLayout(TMP_ROOT).isMonorepo).toBe(true);
  });

  it("识别 common 公共层", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.common).not.toBeNull();
    expect(config.common!.schemaFiles.length).toBe(1);
    expect(config.common!.contractFiles.length).toBe(1);
    expect(config.common!.existingSchemas).toContain("userTable");
  });

  it("识别 apps/api 应用", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.apps.length).toBe(1);
    expect(config.apps[0]!.appName).toBe("api");
  });

  it("structureTree 反映 packages + apps 层级", () => {
    const tree = detectLayout(TMP_ROOT).structureTree;
    expect(tree).toContain("packages");
    expect(tree).toContain("contract");
    expect(tree).toContain("apps");
    expect(tree).toContain("goods.controller.ts");
  });
});

// -----------------------------------------------------------------------
// 测试：空目录
// -----------------------------------------------------------------------
describe("空目录", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("无 package.json 时以目录名作为项目名", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.projectName).toBe(".test-tmp");
  });

  it("生成一个空应用 (无 controller/server)", () => {
    const config = detectLayout(TMP_ROOT);
    expect(config.apps.length).toBe(1);
    expect(config.apps[0]!.controllersDir).toBeNull();
    expect(config.apps[0]!.serverDir).toBeNull();
  });

  it("structureTree 为 project-root", () => {
    expect(detectLayout(TMP_ROOT).structureTree).toBe("project-root");
  });
});
