# api-gen 测试规范

> 本文档定义 `api-gen` 的测试约定。面向用户的 CLI 使用说明见根目录 [`readme.md`](../readme.md),架构规范见 [`architecture.md`](./architecture.md)。
>
> **核心原则**:测试用例是功能的长期回归保障。只要对应功能还存在,测试就一直保留,绝不删除;只有功能被彻底移除时才可删对应用例。

## 运行

```bash
bun test                                  # 跑全部测试
bun test src/__tests__/workflow.test.ts   # 跑单个文件
bun test -t "sync 移除已不存在"            # 按用例名过滤
```

运行时固定用 **bun**(`bun:test`),不用 vitest/jest。测试文件统一放在 `src/__tests__/`,命名 `{主题}.test.ts`。

## 两种测试模式

按被测对象选模式,不要混用。

### 模式 A:纯函数单测

被测对象是不读 `process.cwd()`、无副作用的纯函数(如 `detectLayout`、`parseTsFile`、`traverseAst`)。直接 import 具名函数调用,断言返回值。

- 造数据:在 `beforeAll` 里于独立临时目录内联写文件,或直接传字面量。
- 参考:`init.test.ts`(测 `detectLayout`)、`link.test.ts`(测 AST 提取)。

```ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { detectLayout } from "../structure/detector.js";

const TMP_ROOT = resolve(import.meta.dir, "../../.test-tmp/detector");

describe("单仓库 (single-app)", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });
    writeFileSync(join(TMP_ROOT, "package.json"), JSON.stringify({ name: "test-project" }), "utf-8");
    // ...内联写业务文件
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("识别项目名称", () => {
    expect(detectLayout(TMP_ROOT).projectName).toBe("test-project");
  });
});
```

### 模式 B:命令端到端

被测对象是 `src/commands/*.ts` 里的 `xxxCommand` 函数。这些命令在模块顶层读 `process.cwd()`,所以必须:

1. 把 fixture 复制到独立的 `.test-tmp/` 子目录;
2. `process.chdir()` 进去;
3. 带 `?cb=` 查询串重新 `import` 命令模块(绕过模块缓存,让顶层的 `process.cwd()` 重新求值);
4. 执行后 `chdir` 回原目录。

参考:`workflow.test.ts`。三个辅助函数(`copyFixture` / `freshImport` / `runCmd`)可直接照抄。

```ts
let importSeq = 0;
async function freshImport(path: string) {
  return await import(`${path}?cb=${importSeq++}`); // ?cb= 绕缓存,关键
}

async function runCmd<T>(cwd: string, modPath: string, fnName: string, ...args: any[]): Promise<T> {
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const mod = await freshImport(modPath);
    return await (mod as any)[fnName](...args) as T;
  } finally {
    process.chdir(prev); // 必须恢复,否则污染后续用例
  }
}

// 用例里:
await runCmd(root, "../commands/sync.js", "syncCommand");
const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
expect(cfg.exportIndex.utils.length).toBeGreaterThan(0);
```

## 隔离约定(强制)

- **每个 suite 用独立的 `.test-tmp/` 子目录**(如 `.test-tmp/workflow-single`、`.test-tmp/link`),不共用,避免相互污染。
- `.test-tmp/` 已在 `.gitignore`,产物不入库。
- `beforeAll`:先 `rmSync(root, {recursive:true})` 再重建,保证每次从干净状态开始。
- `afterAll`:`rmSync` 删除该 suite 目录。
- 端到端模式里 `runCmd` 的 `finally` 必须 `process.chdir(prev)`,任何情况下都要还原 CWD。

## 造数据:fixture vs 内联

| 方式 | 何时用 | 位置 |
|------|--------|------|
| **fixture 复制** | 结构复杂、多文件、多 app(monorepo 全流程) | `fixtures/single-app`、`fixtures/monorepo`,用 `copyFixture` 拷进 `.test-tmp` |
| **内联 writeFileSync** | 结构简单、只测一两个文件、想让输入一眼可见 | 直接在 `beforeAll` 里写 |

改动或扩展 `fixtures/` 时,记得同步依赖它的用例断言。

## 命名与文案

- `describe` / `it` 描述用**中文**,写清"测什么"而非"怎么测"(如 `"sync 移除已不存在的目录路径"`、`"非 Elysia 导出返回 null"`)。
- 一个 `it` 只断言一个行为点;多个相关断言(存在性 + 内容)可放同一个 `it`。
- 覆盖正常路径**和**边界:空目录、无 `package.json`、非目标节点返回 `null` 等(见 `init.test.ts` 的"空目录" suite、`link.test.ts` 的"非 Elysia 导出")。

## 新增功能时的测试要求

1. 新增/修改**命令**(`src/commands/*.ts`):用模式 B 加端到端用例,至少覆盖 single-app 与 monorepo 两种布局。
2. 新增/修改**纯函数/工具**(`src/utils`、`src/structure`、`src/scanner`):用模式 A 加单测,含边界。
3. 涉及 **AST 提取**:构造包含"应匹配"与"不应匹配(相似但语义不同 / 注释 / 字符串)"两类样本,验证不误伤——这是本项目"绝不用正则"的兜底。
4. 完成后 `bun test` 全绿再提交。
