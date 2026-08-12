import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync, statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout } from "../structure/detector.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dir, "../..");
const FIXTURES = resolve(ROOT, "fixtures");

let importSeq = 0;

/** 每次都重新 import，避免模块级 CWD 被缓存 */
async function freshImport(path: string) {
  return await import(`${path}?cb=${importSeq++}`);
}

/** 把 fixture 复制到目标目录 */
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

/** 在指定目录下运行命令：chdir → fresh import → 执行 */
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
// 单仓库
// ---------------------------------------------------------------------------

describe("single-app 完整流程", () => {
  const root = join(ROOT, ".test-tmp/workflow-single");
  const configPath = join(root, ".vscode/api-config.json");

  beforeAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
    copyFixture("single-app", root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "single-app" }));
  });

  afterAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
  });

  it("init 创建 api-config.json", async () => {
    await runCmd(root, "../commands/init.js", "initCommand");
    expect(existsSync(configPath)).toBe(true);
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.exportIndex.includes).toEqual(["utils"]);
    expect(cfg.ai.provider).toBe("deepseek");
  });

  it("sync 填充 utils 路径", async () => {
    await runCmd(root, "../commands/sync.js", "syncCommand");
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.exportIndex.utils.length).toBeGreaterThan(0);
    expect(cfg.exportIndex.utils[0]).toContain("src/utils");
  });

  it("info 生成 api-gen.json（纯项目结构，不含 ai/exportIndex）", () => {
    const layout = detectLayout(root);
    expect(layout.projectName).toBe("single-app");
    expect(layout.isMonorepo).toBe(false);
    expect(layout.apps.length).toBe(1);
    expect(layout.structureTree).toContain("utils");
    expect((layout as any).ai).toBeUndefined();
    expect((layout as any).exportIndex).toBeUndefined();
  });

  it("barrel 生成子模块 index.ts", async () => {
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    const pagIndex = join(root, "src/utils/pagination/index.ts");
    expect(existsSync(pagIndex)).toBe(true);
    const pag = readFileSync(pagIndex, "utf-8");
    expect(pag).toContain("calcPage");
    expect(pag).toContain("PageOpt");
    expect(pag).toContain("export type { PageOpt }");

    const utilsIndex = join(root, "src/utils/index.ts");
    expect(existsSync(utilsIndex)).toBe(true);
    const utils = readFileSync(utilsIndex, "utf-8");
    expect(utils).toContain("./pagination");
    expect(utils).toContain("./sort");
  });

  it("新增 hooks 到 includes → sync 自动填充路径", async () => {
    mkdirSync(join(root, "src/hooks"), { recursive: true });
    writeFileSync(join(root, "src/hooks/use-foo.ts"), "export const foo = 1;");

    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex.includes.push("hooks");
    cfg.exportIndex.hooks = [];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    await runCmd(root, "../commands/sync.js", "syncCommand");
    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.exportIndex.hooks).toBeDefined();
    expect(updated.exportIndex.hooks.length).toBeGreaterThan(0);

    // 再次 barrel，验证扁平目录 hooks 的导入路径正确
    await runCmd(root, "../commands/barrel.js", "barrelCommand");
    const hooksIndex = join(root, "src/hooks/index.ts");
    expect(existsSync(hooksIndex)).toBe(true);
    const hooks = readFileSync(hooksIndex, "utf-8");
    expect(hooks).toContain('from "./use-foo"');
    expect(hooks).not.toContain('from "./hooks"');
  });

  it("! 前缀排除路径：被排除的子目录不生成 index.ts，父级 index 也不引用", async () => {
    // 新建一个要被排除的子目录
    mkdirSync(join(root, "src/utils/_internal"), { recursive: true });
    writeFileSync(join(root, "src/utils/_internal/secret.ts"), "export const secret = 1;");

    // 在 utils 组里追加 ! 排除项
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    const utilsPath = cfg.exportIndex.utils[0];
    cfg.exportIndex.utils = [utilsPath, `!${utilsPath}/_internal`];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    // 被排除的子目录不应生成 index.ts
    expect(existsSync(join(root, "src/utils/_internal/index.ts"))).toBe(false);

    // 父级 src/utils/index.ts 不应包含被排除的子目录
    const utilsIndex = readFileSync(join(root, "src/utils/index.ts"), "utf-8");
    expect(utilsIndex).not.toContain("./_internal");
    // 父级仍应包含未排除的子目录（确认只排除指定项，不影响其他）
    expect(utilsIndex).toContain("./pagination");
    expect(utilsIndex).toContain("./sort");
  });

  it("路径形式组：sync 把子内容列表填入（子目录 + 散文件）", async () => {
    // 模拟 packages/logixlysia/src 目录：含子目录 + 散文件 + 孙子级（验证不递归）
    const targetDir = join(root, "packages/logixlysia/src");
    mkdirSync(join(targetDir, "utils"), { recursive: true });
    mkdirSync(join(targetDir, "hooks"), { recursive: true });
    mkdirSync(join(targetDir, "utils/nested"), { recursive: true }); // 孙子级（应被忽略）
    writeFileSync(join(targetDir, "utils/page.ts"), "export const paginate = 1;");
    writeFileSync(join(targetDir, "utils/nested/deep.ts"), "export const deep = 1;");
    writeFileSync(join(targetDir, "hooks/use-foo.ts"), "export const useFoo = 1;");
    writeFileSync(join(targetDir, "foo.ts"), "export const foo = 1;");
    writeFileSync(join(targetDir, "bar.ts"), "export const bar = 1;");

    // 把路径形式组加到 includes
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex.includes = ["utils", "packages/logixlysia/src"];
    cfg.exportIndex["packages/logixlysia/src"] = [];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    await runCmd(root, "../commands/sync.js", "syncCommand");

    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    const group = updated.exportIndex["packages/logixlysia/src"];
    // 路径形式组：sync 填组名下的子内容（子目录 + 散文件）
    expect(group).toContain("packages/logixlysia/src/utils");
    expect(group).toContain("packages/logixlysia/src/hooks");
    expect(group).toContain("packages/logixlysia/src/foo.ts");
    expect(group).toContain("packages/logixlysia/src/bar.ts");
    // 孙子级不应被加入
    expect(group).not.toContain("packages/logixlysia/src/utils/nested");
  });

  it("路径形式组：barrel 以组名作为 rootDir 跑出 src/index.ts 包含散文件 + 子目录索引", async () => {
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    const srcIndex = join(root, "packages/logixlysia/src/index.ts");
    expect(existsSync(srcIndex)).toBe(true);
    const content = readFileSync(srcIndex, "utf-8");

    // 应包含散文件
    expect(content).toContain('from "./foo"');
    expect(content).toContain('from "./bar"');

    // 应包含子目录（转发自子目录的 index.ts）
    expect(content).toContain('from "./utils"');
    expect(content).toContain('from "./hooks"');

    // 不应递归到孙子级
    expect(content).not.toContain("./utils/nested");

    // 子目录的 index.ts 应已生成
    expect(existsSync(join(root, "packages/logixlysia/src/utils/index.ts"))).toBe(true);
    expect(existsSync(join(root, "packages/logixlysia/src/hooks/index.ts"))).toBe(true);

    // 子目录 index 应包含自己的叶子
    const utilsIndex = readFileSync(join(root, "packages/logixlysia/src/utils/index.ts"), "utf-8");
    expect(utilsIndex).toContain("paginate");
    // 子目录 index 不应包含孙子级 deep（barrel 只扫一级）
    expect(utilsIndex).not.toContain("./nested");
  });
});

// ---------------------------------------------------------------------------
// Monorepo
// ---------------------------------------------------------------------------

describe("monorepo 完整流程", () => {
  const root = join(ROOT, ".test-tmp/workflow-mono");
  const configPath = join(root, ".vscode/api-config.json");

  beforeAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
    copyFixture("monorepo", root);
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "monorepo-test" }));
  });

  afterAll(() => {
    if (existsSync(root)) rmSync(root, { recursive: true });
  });

  it("init + sync 填充多路径 utils", async () => {
    await runCmd(root, "../commands/init.js", "initCommand");
    await runCmd(root, "../commands/sync.js", "syncCommand");

    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(cfg.exportIndex.utils.length).toBe(2);
    expect(cfg.exportIndex.utils.some((p: string) => p.includes("contract"))).toBe(true);
    expect(cfg.exportIndex.utils.some((p: string) => p.includes("apps/api"))).toBe(true);
  });

  it("info 识别 monorepo 结构 + 无 ai/exportIndex", () => {
    const layout = detectLayout(root);
    expect(layout.isMonorepo).toBe(true);
    expect(layout.apps.length).toBeGreaterThan(0);
    expect((layout as any).ai).toBeUndefined();
  });

  it("barrel 在多个 utils 路径下生成 index.ts", async () => {
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    const idx1 = join(root, "packages/contract/src/utils/pagination/index.ts");
    expect(existsSync(idx1)).toBe(true);
    const c1 = readFileSync(idx1, "utf-8");
    expect(c1).toContain("calcPage");

    const idx2 = join(root, "apps/api/src/utils/index.ts");
    expect(existsSync(idx2)).toBe(true);
    const c2 = readFileSync(idx2, "utf-8");
    expect(c2).toContain("formatDate");
    expect(c2).toContain("parseId");
    expect(c2).toContain("ApiResult");
    // 扁平目录：应从实际文件 helpers 导入，不从组名 utils 导入
    expect(c2).toContain('from "./helpers"');
    expect(c2).not.toContain('from "./utils"');

    const idx3 = join(root, "packages/contract/src/utils/index.ts");
    expect(existsSync(idx3)).toBe(true);
  });

  it("hooks 加入 includes → sync 填充", async () => {
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex.includes.push("hooks");
    cfg.exportIndex.hooks = [];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    await runCmd(root, "../commands/sync.js", "syncCommand");
    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.exportIndex.hooks.length).toBe(1);
    expect(updated.exportIndex.hooks[0]).toContain("hooks");
  });

  it("sync 移除已不存在的目录路径", async () => {
    const before = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(before.exportIndex.utils.length).toBe(2);

    // 删除一个路径对应的目录
    rmSync(join(root, "apps/api/src/utils"), { recursive: true });

    await runCmd(root, "../commands/sync.js", "syncCommand");

    const after = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(after.exportIndex.utils.length).toBe(1);
    expect(after.exportIndex.utils[0]).toContain("contract");
    expect(after.exportIndex.utils[0]).not.toContain("apps/api");
  });
});
