import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync, statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { scanController } from "../scanner/controller.js";

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

/** 捕获命令执行期间的 stdout */
async function captureStdout(cwd: string, modPath: string, fnName: string, ...args: any[]) {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: 测试替身
  (process.stdout as any).write = (chunk: any) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await runCmd(cwd, modPath, fnName, ...args);
  } finally {
    (process.stdout as any).write = original;
  }
  return chunks.join("");
}

/** 写 .vscode/api-gen.json(info 命令的产物) */
async function writeInfoConfig(root: string) {
  const { detectLayout } = await freshImport("../structure/detector.js");
  const layout = detectLayout(root);
  mkdirSync(join(root, ".vscode"), { recursive: true });
  writeFileSync(join(root, ".vscode/api-gen.json"), JSON.stringify(layout, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// 契约三层分离:实体层 + HTTP 契约层
// ---------------------------------------------------------------------------

describe("契约层生成(实体层 zschema + app 级 model.ts)", () => {
  const root = join(ROOT, ".test-tmp/contracts-tradeflow");

  beforeAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
    copyFixture(".", root);
    // raw 是前置依赖
    mkdirSync(join(root, ".vscode"), { recursive: true });
  });

  afterAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
  });

  // -----------------------------------------------------------------------
  it("gen-zschema --layer=entity 只生成实体层,不动 app", async () => {
    await writeInfoConfig(root);
    await runCmd(root, "../commands/raw.js", "rawCommand");
    await runCmd(root, "../commands/generate-zschema.js", "generateZschemaCommand", { layer: "entity" });

    expect(existsSync(join(root, "packages/shared-types/src/zschema/site.zschema.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/b2b-api/src/modules/site/site.model.ts"))).toBe(false);
    expect(existsSync(join(root, "apps/web/src/server/modules/site-product/site-product.model.ts"))).toBe(false);
  });

  // -----------------------------------------------------------------------
  it("gen-zschema --layer=model 只生成契约层,不动实体层", async () => {
    // 清掉上一轮产物
    rmSync(join(root, "packages/shared-types/src/zschema"), { recursive: true, force: true });
    mkdirSync(join(root, "packages/shared-types/src/zschema"), { recursive: true });
    await writeInfoConfig(root);
    await runCmd(root, "../commands/generate-zschema.js", "generateZschemaCommand", { layer: "model" });

    expect(existsSync(join(root, "packages/shared-types/src/zschema/site.zschema.ts"))).toBe(false);
    // b2b-api 的 site / customer + web 的 hero-card / site-product
    expect(existsSync(join(root, "apps/b2b-api/src/modules/site/site.model.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/b2b-api/src/modules/customer/customer.model.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/web/src/server/modules/hero-card/hero-card.model.ts"))).toBe(true);
    expect(existsSync(join(root, "apps/web/src/server/modules/site-product/site-product.model.ts"))).toBe(true);
  });

  // -----------------------------------------------------------------------
  it("model.ts 用 XxxModel / XxxModelContract 命名,响应带信封", async () => {
    const content = readFileSync(
      join(root, "apps/b2b-api/src/modules/site/site.model.ts"),
      "utf-8",
    );
    expect(content).toContain("export const SiteModel = {");
    expect(content).toContain("export type SiteModelContract = InferDTO<typeof SiteModel>");
    expect(content).toContain("ListResponse: PageResultSchema(SiteEntity)");
    expect(content).toContain("Response: ResultSchema(SiteEntity)");
    // 不用 Elysia 官方的 Post / Body / Delete 命名
    expect(content).not.toMatch(/export const SitePost/);
    // query 的数字/布尔走 QueryShape
    expect(content).toContain("QueryShape(SiteRawInsert.partial().shape)");
  });

  // -----------------------------------------------------------------------
  it("gen-zschema --domain 只生成指定 domain", async () => {
    const root2 = join(ROOT, ".test-tmp/contracts-domain");
    if (existsSync(root2)) rmSync(root2, { recursive: true });
    copyFixture(".", root2);
    await writeInfoConfig(root2);
    await runCmd(root2, "../commands/raw.js", "rawCommand");
    await runCmd(root2, "../commands/generate-zschema.js", "generateZschemaCommand", { domain: "customer" });

    expect(existsSync(join(root2, "packages/shared-types/src/zschema/customer.zschema.ts"))).toBe(true);
    expect(existsSync(join(root2, "packages/shared-types/src/zschema/site.zschema.ts"))).toBe(false);
    expect(existsSync(join(root2, "apps/b2b-api/src/modules/customer/customer.model.ts"))).toBe(true);
    expect(existsSync(join(root2, "apps/b2b-api/src/modules/site/site.model.ts"))).toBe(false);
    rmSync(root2, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it("gen-zschema --app 只给指定 app 生成 model.ts", async () => {
    const root2 = join(ROOT, ".test-tmp/contracts-app");
    if (existsSync(root2)) rmSync(root2, { recursive: true });
    copyFixture(".", root2);
    await writeInfoConfig(root2);
    await runCmd(root2, "../commands/raw.js", "rawCommand");
    await runCmd(root2, "../commands/generate-zschema.js", "generateZschemaCommand", { app: "web" });

    expect(existsSync(join(root2, "apps/web/src/server/modules/site-product/site-product.model.ts"))).toBe(true);
    expect(existsSync(join(root2, "apps/b2b-api/src/modules/site/site.model.ts"))).toBe(false);
    rmSync(root2, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it("gen-zschema 跳过手动维护的文件(无 marker),--force 才覆盖", async () => {
    const root2 = join(ROOT, ".test-tmp/contracts-manual");
    if (existsSync(root2)) rmSync(root2, { recursive: true });
    copyFixture(".", root2);
    await writeInfoConfig(root2);
    await runCmd(root2, "../commands/raw.js", "rawCommand");

    const zschemaPath = join(root2, "packages/shared-types/src/zschema/site.zschema.ts");
    writeFileSync(zschemaPath, "// 手写的,别动我\nexport const Keep = 1;\n", "utf-8");

    await runCmd(root2, "../commands/generate-zschema.js", "generateZschemaCommand");
    expect(readFileSync(zschemaPath, "utf-8")).toContain("别动我");

    // --force 会覆盖(有 marker 才覆盖;这里没 marker 仍然跳过)
    await runCmd(root2, "../commands/generate-zschema.js", "generateZschemaCommand", { force: true });
    expect(readFileSync(zschemaPath, "utf-8")).toContain("别动我");
    rmSync(root2, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  it("link 提醒缺失 <domain>.model.ts", async () => {
    const root2 = join(ROOT, ".test-tmp/contracts-link");
    if (existsSync(root2)) rmSync(root2, { recursive: true });
    copyFixture(".", root2);
    await writeInfoConfig(root2);

    const { collectMissingModels } = await freshImport("../commands/link.js");
    const modulesDir = join(root2, "apps/b2b-api/src/modules");
    const missing = collectMissingModels(
      [
        {
          relativePath: "site/site.controller.ts",
          importPath: "./site/site.controller",
          variableName: "siteController",
        },
      ],
      modulesDir,
    );
    expect(missing.length).toBe(1);
    expect(missing[0]).toBe("site/site.model.ts");
    rmSync(root2, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// controller 扫描:契约挂载点
// ---------------------------------------------------------------------------

describe("controller 扫描(契约挂载点 + detail)", () => {
  const tmp = join(ROOT, ".test-tmp/contracts-scanner");

  beforeAll(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true });
    mkdirSync(join(tmp, "ad"), { recursive: true });
    writeFileSync(
      join(tmp, "ad", "ad.controller.ts"),
      `import { Elysia } from "elysia";
import { AdModel } from "./ad.model";

export const adController = new Elysia({ prefix: "/ad" })
  .get(
    "/",
    {
      query: AdModel.ListQuery,
      response: AdModel.ListResponse,
      detail: { summary: "列表", description: "分页列表", tags: ["Ad"] },
    },
    () => [],
  )
  .post(
    "/",
    {
      body: AdModel.Create,
      params: AdModel.IdParam,
      response: AdModel.Response,
      detail: { summary: "创建", tags: ["Ad"] },
    },
    () => [],
  );
`,
      "utf-8",
    );
  });

  afterAll(() => {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true });
  });

  it("提取 detail(summary / description / tags)", () => {
    const spec = scanController(join(tmp, "ad", "ad.controller.ts"));
    expect(spec.name).toBe("adController");
    expect(spec.prefix).toBe("/ad");
    expect(spec.domain).toBe("ad");
    expect(spec.routes.length).toBe(2);
    // 路由顺序取决于 AST 遍历顺序,按方法取
    const list = spec.routes.find((r) => r.method === "GET")!;
    expect(list.summary).toBe("列表");
    expect(list.description).toBe("分页列表");
    expect(list.tags).toEqual(["Ad"]);
  });

  it("提取 body / query / params / response 的契约引用", () => {
    const spec = scanController(join(tmp, "ad", "ad.controller.ts"));
    const list = spec.routes.find((r) => r.method === "GET")!;
    expect(list.schemaRefs.query?.text).toBe("AdModel.ListQuery");
    expect(list.schemaRefs.query?.owner).toBe("AdModel");
    expect(list.schemaRefs.query?.key).toBe("ListQuery");
    expect(list.schemaRefs.response?.key).toBe("ListResponse");

    const create = spec.routes.find((r) => r.method === "POST")!;
    expect(create.schemaRefs.body?.key).toBe("Create");
    expect(create.schemaRefs.params?.key).toBe("IdParam");
    expect(create.schemaRefs.response?.key).toBe("Response");
  });
});
