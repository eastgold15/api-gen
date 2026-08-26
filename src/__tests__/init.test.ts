import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout } from "../structure/detector.js";

const FIXTURE = resolve(import.meta.dir, "../../fixtures/tradeflow");
const TMP_ROOT = resolve(import.meta.dir, "../../.test-tmp/detector");

// -----------------------------------------------------------------------
// 1. tradeflow 真实 fixture:三个 app + common
// -----------------------------------------------------------------------
describe("tradeflow fixture (三 app 布局)", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    // 用 symlink 让 fixture 真实可用
    // (Bun 测试沙箱对真实软链支持 OK;若不行,改为 cp -r)
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("isMonorepo=true,projectName=tradeflow", () => {
    const config = detectLayout(FIXTURE);
    expect(config.projectName).toBe("tradeflow");
    expect(config.isMonorepo).toBe(true);
  });

  it("common 公共合约层识别 dbschema / tbschema / relation / repos", () => {
    const c = detectLayout(FIXTURE).common;
    expect(c).not.toBeNull();
    expect(c!.dbschemaFiles.length).toBeGreaterThan(0);
    expect(c!.dbschemaFiles[0]).toMatch(/\.dbschema\.ts$/);
    expect(c!.tbschemaFiles).toBeDefined();
    expect(c!.tbschemaRoot).toMatch(/tbschema$/);
    expect(c!.tbschemaRawDir).toMatch(/tbschema\/raw$/);
    expect(c!.existingSchemas).toContain("siteTable");
    expect(c!.existingSchemas).toContain("customerTable");
    expect(c!.existingSchemas).toContain("heroCardTable");
  });

  it("三个 app 全部识别(b2b-api/web/b2b-admin)", () => {
    const apps = detectLayout(FIXTURE).apps;
    const names = apps.map((a) => a.appName).sort();
    expect(names).toEqual(["b2b-admin", "b2b-api", "web"]);
  });

  it("b2b-api modules 在 src/modules/,appType=b2b-api", () => {
    const a = detectLayout(FIXTURE).apps.find((x) => x.appName === "b2b-api");
    expect(a).toBeDefined();
    expect(a!.appType).toBe("b2b-api");
    expect(a!.modulesDir).toMatch(/src\/modules$/);
    expect(a!.aggregateIndex).toMatch(/src\/modules\/index\.ts$/);
  });

  it("web modules 在 src/server/modules/,appType=web", () => {
    const a = detectLayout(FIXTURE).apps.find((x) => x.appName === "web");
    expect(a).toBeDefined();
    expect(a!.appType).toBe("web");
    expect(a!.modulesDir).toMatch(/src\/server\/modules$/);
    expect(a!.aggregateIndex).toMatch(/src\/server\/index\.ts$/);
  });

  it("b2b-admin 无 modules(只有 hooks/api),appType=b2b-admin", () => {
    const a = detectLayout(FIXTURE).apps.find((x) => x.appName === "b2b-admin");
    expect(a).toBeDefined();
    expect(a!.appType).toBe("b2b-admin");
    expect(a!.modulesDir).toBeNull();
    expect(a!.aggregateIndex).toBeNull();
  });

  it("structureTree 包含三个 app 名", () => {
    const tree = detectLayout(FIXTURE).structureTree;
    expect(tree).toContain("b2b-api");
    expect(tree).toContain("web");
    expect(tree).toContain("b2b-admin");
  });
});

// -----------------------------------------------------------------------
// 2. inline:inline b2b-api 单仓(只有 src/modules/<d>/<d>.controller.ts)
// -----------------------------------------------------------------------
describe("inline b2b-api(单仓 modules 形式)", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({ name: "inline-b2b" }));
    mkdirSync(join(TMP_ROOT, "src/modules/site"), { recursive: true });
    writeFileSync(
      join(TMP_ROOT, "src/modules/site/site.controller.ts"),
      `import { Elysia } from "elysia";
export const siteController = new Elysia({ prefix: "/site" }).get("/", () => ({}));`,
    );
  });
  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("modulesDir 指向 src/modules", () => {
    const a = detectLayout(TMP_ROOT).apps[0]!;
    expect(a.modulesDir).toMatch(/src\/modules$/);
    expect(a.appType).toBe("b2b-api");
  });
});

// -----------------------------------------------------------------------
// 3. inline:inline web(只有 src/server/modules/<d>/<d>.controller.ts)
// -----------------------------------------------------------------------
describe("inline web(单仓 server modules 形式)", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({ name: "inline-web" }));
    mkdirSync(join(TMP_ROOT, "src/server/modules/hero-card"), { recursive: true });
    writeFileSync(
      join(TMP_ROOT, "src/server/modules/hero-card/hero-card.controller.ts"),
      `import { Elysia } from "elysia";
export const heroCardController = new Elysia({ prefix: "/hero-card" }).get("/", () => ({}));`,
    );
  });
  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("modulesDir 指向 src/server/modules,appType=web", () => {
    const a = detectLayout(TMP_ROOT).apps[0]!;
    expect(a.modulesDir).toMatch(/src\/server\/modules$/);
    expect(a.appType).toBe("web");
    expect(a.aggregateIndex).toMatch(/src\/server\/index\.ts$/);
  });
});

// -----------------------------------------------------------------------
// 4. 空目录
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
    expect(detectLayout(TMP_ROOT).projectName).toBe("detector");
  });

  it("无 controller 时 app.modulesDir=null", () => {
    const a = detectLayout(TMP_ROOT).apps[0]!;
    expect(a.modulesDir).toBeNull();
  });
});
