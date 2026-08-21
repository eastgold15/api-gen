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

  it("--lib 模式只过滤 package.json 入口对应的 barrel", async () => {
    // 在 utils 下放一个混合标注的子模块
    const visDir = join(root, "src/utils/visibility");
    mkdirSync(visDir, { recursive: true });
    writeFileSync(
      join(visDir, "curated.ts"),
      "/** @public */\nexport const kept = 1;\n/** @internal */\nexport const dropped = 2;\nexport const plainValue = 3;\n/** @public 类型 */\nexport type PublicShape = { id: string };\n",
    );

    // 1) full 模式:子 barrel 全量导出(组织聚合用)
    await runCmd(root, "../commands/barrel.js", "barrelCommand", { lib: false });
    const visFull = readFileSync(join(visDir, "index.ts"), "utf-8");
    expect(visFull).toContain("kept");
    expect(visFull).toContain("dropped"); // @internal 在子 barrel 也保留(供包内/测试使用)
    expect(visFull).toContain("plainValue");
    expect(visFull).toContain("PublicShape");

    // 2) --lib 模式:子 barrel 仍全量(用户可能需要 `import { x } from "./folder"`)
    await runCmd(root, "../commands/barrel.js", "barrelCommand", { lib: true });
    const visLib = readFileSync(join(visDir, "index.ts"), "utf-8");
    expect(visLib).toContain("kept");
    expect(visLib).toContain("dropped"); // 子 barrel 不过滤
    expect(visLib).toContain("plainValue");
    expect(visLib).toContain("PublicShape");

    // 父级 utils/index.ts 也仍要 re-export 该子模块(只要该子模块非空)
    const utilsIndex = readFileSync(join(root, "src/utils/index.ts"), "utf-8");
    expect(utilsIndex).toContain("./visibility");
  });

  it("--lib 模式只过滤 package.json 入口对应的顶层 barrel", async () => {
    // 在 packages/logixlysia/src 下放一个混合标注的子模块,该路径
    // 配了 package.json main 指向 ./dist/index.js → src/index.ts 入口。
    const targetDir = join(root, "packages/logixlysia/src");
    mkdirSync(join(targetDir, "visibility"), { recursive: true });
    writeFileSync(
      join(targetDir, "visibility/curated.ts"),
      "/** @public */\nexport const kept = 1;\n/** @internal */\nexport const dropped = 2;\nexport const plainValue = 3;\n/** @public 类型 */\nexport type PublicShape = { id: string };\n",
    );
    // 给 packages/logixlysia 写一个真实的 package.json,main 指向入口
    mkdirSync(join(targetDir, ".."), { recursive: true });
    writeFileSync(
      join(targetDir, "..", "package.json"),
      JSON.stringify({ name: "logixlysia", main: "./dist/index.js" }),
    );

    // 在 cfg 里加 packages/logixlysia/src 作为子组
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex.includes = ["utils", "packages/logixlysia/src"];
    cfg.exportIndex["packages/logixlysia/src"] = ["packages/logixlysia/src/visibility"];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    // --lib 模式:顶层 src/index.ts 应该过滤(@public 保留,未标注/@internal 排除)
    await runCmd(root, "../commands/barrel.js", "barrelCommand", { lib: true });
    const topIndex = readFileSync(join(targetDir, "index.ts"), "utf-8");
    expect(topIndex).toContain("kept");
    expect(topIndex).toContain("PublicShape");
    expect(topIndex).not.toContain("plainValue");
    expect(topIndex).not.toContain("dropped");
  });

  it("路径形式组：sync 递归填入所有有内容的子目录 + 组根散文件", async () => {
    // 模拟 packages/logixlysia/src 目录：含子目录 + 散文件 + 孙子级（递归到底）
    const targetDir = join(root, "packages/logixlysia/src");
    mkdirSync(join(targetDir, "utils"), { recursive: true });
    mkdirSync(join(targetDir, "hooks"), { recursive: true });
    mkdirSync(join(targetDir, "utils/nested"), { recursive: true }); // 孙子级也要被加入
    writeFileSync(join(targetDir, "utils/page.ts"), "export const paginate = 1;");
    writeFileSync(join(targetDir, "utils/nested/deep.ts"), "export const deep = 1;");
    writeFileSync(join(targetDir, "hooks/use-foo.ts"), "export const useFoo = 1;");
    writeFileSync(join(targetDir, "foo.ts"), "export const foo = 1;");
    writeFileSync(join(targetDir, "bar.ts"), "export const bar = 1;");

    // 把路径形式组加到 includes,空数组 → 触发递归填充
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex.includes = ["utils", "packages/logixlysia/src"];
    cfg.exportIndex["packages/logixlysia/src"] = [];
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    await runCmd(root, "../commands/sync.js", "syncCommand");

    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    const group = updated.exportIndex["packages/logixlysia/src"];
    // 一级子目录 + 组根散文件
    expect(group).toContain("packages/logixlysia/src/utils");
    expect(group).toContain("packages/logixlysia/src/hooks");
    expect(group).toContain("packages/logixlysia/src/foo.ts");
    expect(group).toContain("packages/logixlysia/src/bar.ts");
    // 递归到底:每层有内容的子目录都加入
    expect(group).toContain("packages/logixlysia/src/utils/nested");
    // 深层散文件由子目录 barrel 自己管,不出现在组根 included 列表
    expect(group).not.toContain("packages/logixlysia/src/utils/nested/deep.ts");
    expect(group).not.toContain("packages/logixlysia/src/utils/page.ts");
    expect(group).not.toContain("packages/logixlysia/src/hooks/use-foo.ts");
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

    // 递归到底:孙子级也进入汇总
    expect(content).toContain('from "./utils/nested"');

    // 子目录的 index.ts 应已生成
    expect(existsSync(join(root, "packages/logixlysia/src/utils/index.ts"))).toBe(true);
    expect(existsSync(join(root, "packages/logixlysia/src/hooks/index.ts"))).toBe(true);
    expect(existsSync(join(root, "packages/logixlysia/src/utils/nested/index.ts"))).toBe(true);

    // 子目录 index 应包含自己的叶子
    const utilsIndex = readFileSync(join(root, "packages/logixlysia/src/utils/index.ts"), "utf-8");
    expect(utilsIndex).toContain("paginate");
    // 递归级联:中间目录的 barrel 也 re-export 子目录的 barrel
    expect(utilsIndex).toContain('from "./nested"');

    // 孙子级的 index.ts 应包含 deep
    const nestedIndex = readFileSync(join(root, "packages/logixlysia/src/utils/nested/index.ts"), "utf-8");
    expect(nestedIndex).toContain("deep");
  });

  it("递归级联：中间目录无散文件时,其 index.ts 聚合子目录 barrel", async () => {
    // 先用路径形式组重跑 barrel,让 src/utils/index.ts 重新生成(级联模式)
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex = {
      includes: ["./src"],
      "./src": [],
    };
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    // src/utils 没有直接的 .ts 文件,只有 _internal/pagination/sort/visibility 四个子目录
    // 验证 src/utils/index.ts 存在且 re-export 每个子目录
    const utilsIdxPath = join(root, "src/utils/index.ts");
    expect(existsSync(utilsIdxPath)).toBe(true);
    const utilsIdx = readFileSync(utilsIdxPath, "utf-8");
    // 级联 re-export:从子目录 barrel 拉
    expect(utilsIdx).toContain('from "./_internal"');
    expect(utilsIdx).toContain('from "./pagination"');
    expect(utilsIdx).toContain('from "./sort"');
    expect(utilsIdx).toContain('from "./visibility"');
  });

  it("路径形式组：! 排除路径同时影响 sync 递归与 barrel 处理", async () => {
    // 单独建一组,验证 ! 排除在递归填充中也生效
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex = {
      includes: ["./packages/contract/src"],
      "./packages/contract/src": ["!./packages/contract/src/drizzle"],
    };
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    // sync 已经有显式列表,应该不动(尊重用户)
    await runCmd(root, "../commands/sync.js", "syncCommand");
    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.exportIndex["./packages/contract/src"]).toContain("!./packages/contract/src/drizzle");

    // barrel 处理时,被排除的 drizzle 不进 included,父级 src/index.ts 也不引用
    await runCmd(root, "../commands/barrel.js", "barrelCommand");
    const topIdx = join(root, "packages/contract/src/index.ts");
    if (existsSync(topIdx)) {
      const content = readFileSync(topIdx, "utf-8");
      expect(content).not.toContain('from "./drizzle"');
    }
  });

  it("路径形式组空数组：barrel 不依赖 sync 直接自动递归展开", async () => {
    // 单仓 fixture 只有 src/。用 ./src 作为路径形式组(以 . 开头,isPathLike 命中)
    // 重置 exportIndex,只留这一个组 + 空数组,直接跑 barrel
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    cfg.exportIndex = {
      includes: ["./src"],
      "./src": [],
    };
    writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf-8");

    // 直接跑 barrel,不跑 sync
    await runCmd(root, "../commands/barrel.js", "barrelCommand");

    // 该路径形式组下的所有子目录应自动生成 index.ts
    const utilsIdx = join(root, "src/utils/index.ts");
    const paginationIdx = join(root, "src/utils/pagination/index.ts");
    const sortIdx = join(root, "src/utils/sort/index.ts");
    const topIdx = join(root, "src/index.ts");

    expect(existsSync(utilsIdx)).toBe(true);
    expect(existsSync(paginationIdx)).toBe(true);
    expect(existsSync(sortIdx)).toBe(true);
    expect(existsSync(topIdx)).toBe(true);

    // 组级 index.ts 应包含子目录
    const top = readFileSync(topIdx, "utf-8");
    expect(top).toContain('from "./utils"');
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
