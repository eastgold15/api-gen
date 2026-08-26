# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

`api-gen`（`@eastgold15/api-gen`）是一个基于 **OXc AST 静态解析** 的 CLI 工具，服务于 Elysia + Drizzle + TypeBox + Eden-TanStack-Query 的分层后端项目。它扫描按约定命名的分层文件，生成桶导出、控制器聚合、raw DTO、TypeBox 契约骨架、Eden hooks，并组装 AI 提示词 / 调用 AI 生成分层代码。核心原则：**一律用 AST 解析，绝不用正则匹配业务代码**，避免注释/字符串误匹配。

## 常用命令

```bash
bun test                          # 跑全部测试（bun:test）
bun test src/__tests__/link.test.ts   # 跑单个测试文件
bun run build                     # packem 打包到 dist/ 并 npm link（本地全局可用 api-gen）
bun run dev                       # packem --watch 监听构建
bun run type-check                # tsc --noEmit 类型检查
```

- 运行时用 **bun**（本仓库是 Bun 项目，tsconfig `types: ["bun-types"]`，测试用 `bun:test`）。
- 打包器是 **packem**（esbuild transformer，配置见 `packem.config.ts`），产物为单文件 `dist/index.mjs`，作为 `bin.api-gen` 入口。
- 测试通过复制 `fixtures/tradeflow/` 到 `.test-tmp/`，`process.chdir` 后带 `?cb=` 查询串重新 `import` 命令模块执行——因为命令模块在顶层读取 `process.cwd()`，必须绕过模块缓存。完整测试约定（两种模式、隔离规则、新增功能的测试要求）见 `docs/testing.md`。

## 两套配置文件（关键区分）

工具的所有产物都落在项目的 `.vscode/` 目录，有三个**职责不同**的配置：

| 文件 | 生成命令 | 用途 | 结构类型 |
|------|---------|------|---------|
| `.vscode/api-config.json` | `init` | CLI 脚本配置：AI 服务商密钥、barrel 导出组（`exportIndex`）、工作流管道（`pipelines`） | `ApiConfig` |
| `.vscode/api-gen.json` | `info` | 给 AI 看的项目结构：应用列表 + AppType、公共合约层、结构树 | `ApiGenRootConfig` |
| `.vscode/api-spec.json` | `scan` | 扫描产物：所有路由规格 + `projectContext` | `ApiSpec` |
| `.vscode/ai-prompt.template.md` | `info` | AI 提示词模板（占位符 `{{VAR}}`） | — |
| `.vscode/ai-prompt.md` | `make-prompt` | 渲染后的成品提示词 | — |

改动配置结构时，两个 `interface` 都定义在 `src/types/api-gen.json.ts`，是唯一事实来源。

## 分层文件命名约定（AST 扫描的基础）

业务文件固定格式 `{模块名}.{分层}.ts`，分层标识（定义在 `src/utils/tree-builder.ts` 的 `LAYERS`）：

| 分层 | 后缀示例 | 用途 |
|------|---------|------|
| controller | `<domain>.controller.ts` | Elysia 路由 |
| service | `<domain>.service.ts` | 业务逻辑 |
| repos | `<domain>.repos.ts` | Drizzle 数据访问层 |
| dbschema | `<name>.dbschema.ts` | Drizzle `pgTable` |
| tbschema | `<name>.tbschema.ts` | TypeBox 契约 |
| relation | `<name>.relation.ts` | 外键/联表 |
| def | `<name>.def.ts` | 3 层常量字典（DEF + OPTIONS + GROUPS） |

## AppType 配置驱动

`detectLayout` 探测目录结构后给每个 app 标注 `appType`（默认值），但 `.vscode/api-gen.json` 里的 `appType` 是**用户可在 `info` 交互覆盖或手编**的最终值。下游 `link` / `gen-hook` / `raw` 直接读 `config.apps[i].appType`，**不重新探测**。四种 AppType 见 `docs/app-types.md`。

## 目录结构探测

`src/structure/detector.ts` 探测规则：

- 有 `apps/` 或 `packages/` → monorepo；公共合约层固定在 `packages/contract`。
- 每个 app 的 modules 根目录按 `appType` 选：`b2b-api` → `src/modules`；`web` → `src/server/modules`；`b2b-admin` / `frontend` → 无 modules。
- 跳过黑名单 `SKIP_DIRS`（`node_modules` / `dist` / `.vscode` / `.git` / `scripts` / `.next` / `.claude` / `turbo` 等）——这份集合在多个文件里各自重复定义，改动需同步。

完整识别规则见 `docs/detector.md`。

## 代码架构

**入口**：`src/index.ts` 用 `@visulima/cerebro` 注册所有命令，静态 import `src/commands/*.ts`。每个命令模块导出一个默认异步函数 + 一个 `xxxCommand` 具名函数（测试直接调具名函数）。

**AST 层**（`src/utils/ast-scanner.ts`）：所有扫描的公共底座。
- `parseTsFile()` 用固定 OXc 配置解析（`lang:"ts"`, `showSemanticErrors:false` 容错半成品代码）。
- `traverseAst()` 深度优先遍历；`getStringValue()` / `getObjectProperty()` 提取字面量。
- 新增提取需求时，在 `traverseAst` 回调里加节点类型判断即可，不要引入正则。

**命令职责**：
- `init` → 写 `api-config.json`（含默认 AI 配置、`exportIndex.includes:["utils", "<path>/definitions"]`、示例 pipeline）。
- `sync` → 先跑 `pipelines`（`src/utils/file-transform.ts` 的 `select`/`prepend` 步骤），再扫描目录填充/清理 `exportIndex` 各组路径（移除已不存在的目录）。
- `info` → `detectLayout()` 探测结构，交互确认 + **逐 app 覆盖 AppType**，写 `api-gen.json` + 初始化提示词模板。
- `scan` → 逐 app 用 `src/scanner/controller.ts` 提取 Elysia 路由（`new Elysia({prefix})` + `.get/.post` 链式调用的 `detail`/`allPermissions`），按 tag 分组写 `api-spec.json`。
- `make-prompt` → 用 `api-spec.json` + 模板渲染出 `ai-prompt.md`（`-t` 按 tag、`-p` 按路径筛选）。
- `generate` → 读两套配置，逐 tag 模块调 `src/generator/ai.ts` 的 `callAI()`（OpenAI 兼容格式，强制 JSON 返回，带指数退避重试），把 `schemaAdditions`（追加）/`contractAdditions`（覆盖）写盘。
- `raw` → 从 dbschema 提取 `pgTable`，在 `tbschema/raw/` 生成 `<name>.dbschema.raw.ts` 的 `createInsertSchema/createSelectSchema/createUpdateSchema` 基础字段定义。
- `gen-tbschema` → 从 dbschema + raw 派生 `<name>.tbschema.ts` 骨架（含 `Response/Create/Update/Patch/ListQuery/ListResponse` + `XxxContract = InferDTO<typeof XxxTBSchema>`）。`--force` 覆盖。
- `barrel` → 扫描 `exportIndex` 组路径，用 AST 提取每个文件的具名导出（区分 value/type），生成级联 `index.ts` 桶导出。**路径形式组:组根只引用一级子目录,孙级经中间层 barrel 间接暴露**(避免重复导出)。路径形式组（组名 = 路径）空数组时自动递归展开,中间层 barrel 也会 re-export 子目录 barrel（递归级联）。共享工具 `src/utils/export-index.ts` 的 `scanPathGroupChildren` 同时给 sync 用。
- `link` → 按 AppType 决策：b2b-api 输出 `applyAllModules()` 到 `src/modules/index.ts`；web 输出 `applyAllControllers()` 到 `src/server/index.ts`；b2b-admin/frontend 跳过。共用 `discoverControllers(modulesDir, importPrefix)` 扫描 `<domain>/<domain>.controller.ts`。
- `gen-hook` → 从 b2b-api controller 路由派生 `web` / `b2b-admin` 的 `src/hooks/api/use-<domain>.ts` Eden-TanStack-Query 骨架（GET → useQuery,POST/PUT/PATCH/DELETE → useMutation）。`--domain` 限制单域,`--target` 限制单目标。

## 自动生成文件的安全约定

`barrel` / `link` / `raw` / `gen-tbschema` / `gen-hook` 生成的文件首行都带自动标记注释（如 `// Auto-generated by \`api-gen <cmd>\` — do not edit manually.`）。`barrel` 在覆盖前检查：**已存在但无标记的 `index.ts` 视为手动维护，跳过不覆盖**。新增生成类命令时沿用此保护机制。

## 编码风格

- 依赖 `@visulima/*` 全家桶：路径用 `@visulima/path`（`resolve`/`join`/`relative`），文件 IO 用 `@visulima/fs`，日志用 `@visulima/pail`（`pail.info/warn/success`）+ `@visulima/colorize`（`chalk`），表格用 `@visulima/tabular`，错误用 `@visulima/error` 的 `VisulimaError`。避免混用 `node:fs`/`node:path`（现存代码有混用，新代码优先 `@visulima`）。
- ESM only（`type: "module"`），import 路径带 `.js` 后缀。
- 所有用户可见文案、注释用中文。
