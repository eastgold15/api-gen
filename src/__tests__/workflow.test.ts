import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync, statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout } from "../structure/detector.js";

const ROOT = resolve(import.meta.dir, "../..");
const FIXTURES = resolve(ROOT, "fixtures/tradeflow");

let importSeq = 0;
async function freshImport(path: string) {
  return await import(`${path}?cb=${importSeq++}`);
}

function copyFixture(name: string, dst: string) {
  const src = join(FIXTURES, name);
  function copyRec(from: string, to: string) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      const s = join(from, entry);
      const t = join(to, entry);
      if (statSync(s).isDirectory()) {
        copyRec(s, t);
      } else {
        writeFileSync(t, readFileSync(s, "utf-8"));
      }
    }
  }
  copyRec(src, dst);
}

async function runCmd<T>(cwd: string, modPath: string, fnName: string, ...args: any[]): Promise<T> {
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const mod = await freshImport(modPath);
    const fn = (mod as any)[fnName];
    return await fn(...args) as T;
  } finally {
    process.chdir(prev);
  }
}

// ---------------------------------------------------------------------------
// tradeflow 完整 E2E
// ---------------------------------------------------------------------------

describe("tradeflow 完整流程 (3 app 布局)", () => {
  const root = join(ROOT, ".test-tmp/workflow-tradeflow");
  const configPath = join(root, ".vscode/api-config.json");
  const infoPath = join(root, ".vscode/api-gen.json");

  beforeAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
    copyFixture(".", root); // tradeflow 是唯一 fixture,直接复制整个目录
  });

  afterAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
  });

  // -----------------------------------------------------------------------
  it("detectLayout 识别项目结构", () => {
    const layout = detectLayout(root);
    expect(layout.projectName).toBe("tradeflow");
    expect(layout.isMonorepo).toBe(true);
    expect(layout.apps.length).toBe(3);
    const names = layout.apps.map((a) => a.appName).sort();
    expect(names).toEqual(["b2b-admin", "b2b-api", "web"]);
  });

  // -----------------------------------------------------------------------
  it("init 生成 api-config.json(含 definitions + drizzle 桶组)", async () => {
    await runCmd(root, "../commands/init.js", "initCommand");
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.exportIndex.includes).toContain("utils");
    expect(cfg.exportIndex.includes).toContain("packages/contract/src/drizzle");
    expect(cfg.exportIndex.includes).toContain("packages/contract/src/utils/constants/definitions");
    expect(cfg.exportIndex["packages/contract/src/utils/constants/definitions"]).toEqual([]);
  });

  // -----------------------------------------------------------------------
  it("sync 填充 utils 路径 + 路径形式组 definitions", async () => {
    await runCmd(root, "../commands/sync.js", "syncCommand");
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.exportIndex.utils.length).toBeGreaterThan(0);
    // 路径形式组应自动扫描,找到 status.def.ts
    const defs = cfg.exportIndex["packages/contract/src/utils/constants/definitions"];
    expect(defs.length).toBeGreaterThan(0);
    expect(defs[0]).toContain("status.def.ts");
  });

  // -----------------------------------------------------------------------
  it("barrel 生成 utils + definitions 两组 index.ts", async () => {
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    // definitions 组(路径形式组)生成 definitions/index.ts
    const defsIdx = join(root, "packages/contract/src/utils/constants/definitions/index.ts");
    expect(existsSync(defsIdx)).toBe(true);
    const content = readFileSync(defsIdx, "utf-8");
    // status.def.ts 的 3 个常量都应 re-export
    expect(content).toContain("STATUS_DEF");
    expect(content).toContain("STATUS_OPTIONS");
    expect(content).toContain("STATUS_GROUPS");
  });

  // -----------------------------------------------------------------------
  it("write .vscode/api-gen.json 模拟 info 落盘", async () => {
    const layout = detectLayout(root);
    mkdirSync(join(root, ".vscode"), { recursive: true });
    writeFileSync(infoPath, JSON.stringify(layout, null, 2), "utf-8");
    expect(existsSync(infoPath)).toBe(true);
  });

  // -----------------------------------------------------------------------
  it("raw 从 dbschema 派生 tbschema/raw/*.dbschema.raw.ts(优先用桶路径)", async () => {
    await runCmd(root, "../commands/raw.js", "rawCommand");
    const rawSite = join(root, "packages/contract/src/tbschema/raw/site.dbschema.raw.ts");
    const rawCustomer = join(root, "packages/contract/src/tbschema/raw/customer.dbschema.raw.ts");
    expect(existsSync(rawSite)).toBe(true);
    expect(existsSync(rawCustomer)).toBe(true);
    const site = readFileSync(rawSite, "utf-8");
    expect(site).toContain("siteTable");
    expect(site).toContain("SiteRawSelect");
    expect(site).toContain("SiteRawInsert");
    expect(site).toContain("SiteRawUpdate");
    // 桶路径(raw → ../../../drizzle):barrel 已先跑,drizzle/index.ts 存在
    expect(site).toMatch(/import \{ siteTable \} from "\.\.\/\.\.\/drizzle";/);
  });

  // -----------------------------------------------------------------------
  it("raw 缺桶时 fallback 到单文件路径(无 index.ts)", async () => {
    const drizzleIdx = join(root, "packages/contract/src/drizzle/index.ts");
    if (!existsSync(drizzleIdx)) {
      // 桶不存在(理论上有,但保险),直接测 fallback:删 raw 后重跑
      throw new Error("前提:drizzle/index.ts 必须存在(上一条测试已生成)");
    }
    // 备份桶,删桶,删 raw,重跑 raw,验证 fallback,再恢复
    const backup = readFileSync(drizzleIdx, "utf-8");
    const { unlinkSync, existsSync: e2, writeFileSync: w2 } = await import("node:fs");
    try {
      unlinkSync(drizzleIdx);
      // 删旧 raw 让 rawCommand 重新生成
      const rawFiles = [
        join(root, "packages/contract/src/tbschema/raw/site.dbschema.raw.ts"),
        join(root, "packages/contract/src/tbschema/raw/customer.dbschema.raw.ts"),
        join(root, "packages/contract/src/tbschema/raw/hero-card.dbschema.raw.ts"),
        join(root, "packages/contract/src/tbschema/raw/site-product.dbschema.raw.ts"),
      ];
      for (const f of rawFiles) if (e2(f)) unlinkSync(f);

      await runCmd(root, "../commands/raw.js", "rawCommand");
      const site = readFileSync(rawFiles[0], "utf-8");
      // fallback:无桶,直接 import 单文件(去 .ts)
      expect(site).toMatch(/import \{ siteTable \} from "\.\.\/\.\.\/drizzle\/table\.dbschema";/);
    } finally {
      w2(drizzleIdx, backup, "utf-8");
    }
  });

  // -----------------------------------------------------------------------
  it("gen-tbschema 从 dbschema + raw 派生 tbschema 骨架", async () => {
    await runCmd(root, "../commands/generate-tbschema.js", "generateTbschemaCommand");
    const tbs = join(root, "packages/contract/src/tbschema/site.tbschema.ts");
    expect(existsSync(tbs)).toBe(true);
    const content = readFileSync(tbs, "utf-8");
    expect(content).toContain("SiteTBSchema");
    expect(content).toContain("SiteContract");
    expect(content).toContain("Response");
    expect(content).toContain("Create");
    expect(content).toContain("ListQuery");
    expect(content).toContain("SiteRawInsert");
    expect(content).toContain("SiteRawSelect");
  });

  // -----------------------------------------------------------------------
  it("link: b2b-api 生成 applyAllModules + web 生成 applyAllControllers", async () => {
    await runCmd(root, "../commands/link.js", "linkCommand");

    const b2bIdx = join(root, "apps/b2b-api/src/modules/index.ts");
    const webIdx = join(root, "apps/web/src/server/index.ts");

    expect(existsSync(b2bIdx)).toBe(true);
    const b2b = readFileSync(b2bIdx, "utf-8");
    expect(b2b).toContain("applyAllModules");
    expect(b2b).toContain("siteController");
    expect(b2b).toContain("customerController");
    // health 单独 export(不进入 applyAllModules 链,避免重复 import)
    expect(b2b).toContain("export { healthController }");
    expect(b2b).not.toMatch(/^import { healthController }/m);
    expect(b2b).not.toMatch(/\.use\(healthController\)/);
    // b2b-api 头注释
    expect(b2b).toContain("b2b-api modules aggregator");

    expect(existsSync(webIdx)).toBe(true);
    const web = readFileSync(webIdx, "utf-8");
    expect(web).toContain("applyAllControllers");
    expect(web).toContain("heroCardController");
    expect(web).toContain("siteProductController");
    // import 前缀应为 ./modules(聚合在 src/server/index.ts)
    expect(web).toMatch(/from "\.\/modules\//);
  });

  // -----------------------------------------------------------------------
  it("gen-hook 从 b2b-api controller 派生 web/b2b-admin hook", async () => {
    await runCmd(root, "../commands/generate-hook.js", "generateHookCommand");

    const webHook = join(root, "apps/web/src/hooks/api/use-site.ts");
    const adminHook = join(root, "apps/b2b-admin/src/hooks/api/use-site.ts");
    expect(existsSync(webHook)).toBe(true);
    expect(existsSync(adminHook)).toBe(true);

    const content = readFileSync(webHook, "utf-8");
    // site controller 路由:GET /current, GET /:id, POST /, DELETE /:id
    expect(content).toContain("useCurrentSite");
    expect(content).toContain("useSiteDetail");
    expect(content).toContain("useCreateSite");
    expect(content).toContain("useDeleteSite");
    // eden 链式 + queryOptions(无 v1,默认 edenPrefix="")
    expect(content).toContain("eden.site");
    expect(content).not.toContain("eden.api.v1");
    expect(content).toContain("queryOptions");
    expect(content).toContain("mutationOptions");
    // 函数体完整(防回归:模板曾漏 `{`)
    expect(content).toMatch(/useCurrentSite\(\) \{\s+const eden/);
    expect(content).toMatch(/useSiteDetail\(id: string\) \{\s+const eden/);
  });

  // -----------------------------------------------------------------------
  it("gen-hook 读取 edenPrefix 配置(api 前缀挂载)", async () => {
    // 重新写 api-gen.json 加上 edenPrefix:"api"
    const infoPath2 = join(root, ".vscode/api-gen.json");
    const cfg = JSON.parse(readFileSync(infoPath2, "utf-8"));
    cfg.edenPrefix = "api";
    writeFileSync(infoPath2, JSON.stringify(cfg, null, 2), "utf-8");

    rmSync(join(root, "apps/web/src/hooks/api"), { recursive: true, force: true });
    rmSync(join(root, "apps/b2b-admin/src/hooks/api"), { recursive: true, force: true });
    await runCmd(root, "../commands/generate-hook.js", "generateHookCommand");

    const webHook = join(root, "apps/web/src/hooks/api/use-site.ts");
    const content = readFileSync(webHook, "utf-8");
    // edenPrefix="api" → eden.api.site
    expect(content).toContain("eden.api.site");
    expect(content).toContain("eden.api.site.get");
    // 复原,避免影响后续测试
    cfg.edenPrefix = "";
    writeFileSync(infoPath2, JSON.stringify(cfg, null, 2), "utf-8");
  });

  // -----------------------------------------------------------------------
  it("gen-hook --domain=site 只输出 site", async () => {
    // 先清空之前的 hook 输出
    rmSync(join(root, "apps/web/src/hooks/api"), { recursive: true, force: true });
    rmSync(join(root, "apps/b2b-admin/src/hooks/api"), { recursive: true, force: true });
    await runCmd(root, "../commands/generate-hook.js", "generateHookCommand", { domain: "site" });

    expect(existsSync(join(root, "apps/web/src/hooks/api/use-site.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/web/src/hooks/api/use-customer.ts"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  it("gen-hook --target=web 只写 web", async () => {
    rmSync(join(root, "apps/web/src/hooks/api"), { recursive: true, force: true });
    rmSync(join(root, "apps/b2b-admin/src/hooks/api"), { recursive: true, force: true });
    await runCmd(root, "../commands/generate-hook.js", "generateHookCommand", { target: "web" });

    expect(existsSync(join(root, "apps/web/src/hooks/api/use-site.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/b2b-admin/src/hooks/api/use-site.ts"))).toBe(false);
  });
});
