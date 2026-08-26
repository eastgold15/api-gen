---
name: api-gen
description: |
  this skill should be used when working with the `api-gen` CLI tool — a barrel-export + Elysia scaffolding generator for the Elysia + Drizzle + TypeBox + Eden-TanStack-Query stack. Activates for any task involving running `api-gen init/sync/info/scan/barrel/raw/gen-tbschema/link/gen-hook/generate/make-prompt`, regenerating `index.ts` barrel files, scaffolding tbschema / raw / hook files, or extending the tool itself. Source: /home/pori/Documents/GitHub/api-gen.
---

# api-gen CLI 速通

> **源仓库**:`/home/pori/Documents/GitHub/api-gen`(本机已 `npm link`,全局 `api-gen` 可用)
> **完整文档**:`docs/`(按命令分文件,见 §7 索引)
> **目标项目**:`tradeflow`(三 app + 公共合约包 + 路径形式组桶导出)

## 决策树 — 我要用哪个命令?

```
我想…
  │
  ├─ 首次接入 / 重新生成 .vscode/api-config.json     → init
  ├─ 维护 exportIndex 路径清单(可跳)                → sync
  ├─ 探测项目结构,生成 .vscode/api-gen.json          → info
  ├─ 扫描现有路由,生成 .vscode/api-spec.json         → scan
  ├─ 跑 AI 拼提示词 / 调 AI 生代码                  → make-prompt → generate
  │
  ├─ 生成 / 重新生成 index.ts 桶导出                → barrel
  ├─ 从 *.dbschema.ts 派生 raw DTO                  → raw
  ├─ 从 dbschema + raw 派生 *.tbschema.ts 骨架       → gen-tbschema
  ├─ 生成模块聚合入口(b2b-api / web)               → link
  └─ 从 controller 派生 Eden-TanStack-Query hook    → gen-hook
```

**tradeflow 完整流水线**(从空仓库到全部生成):

```bash
api-gen init              # 1. 写 .vscode/api-config.json(exportIndex 默认带 drizzle 桶组)
api-gen info              # 2. 探测结构 → .vscode/api-gen.json(逐 app 确认 appType)
api-gen barrel            # 3. 生成 utils + drizzle + definitions 三组桶
api-gen raw               # 4. 从 dbschema 派生 tbschema/raw/*.dbschema.raw.ts
api-gen gen-tbschema      # 5. 派生 tbschema/*.tbschema.ts 骨架(可选 --domain / --force)
api-gen link              # 6. b2b-api → applyAllModules;web → applyAllControllers
api-gen gen-hook          # 7. b2b-api controller → web/b2b-admin use-*.ts hook
```

## §1 关键设计 — 配置驱动

工具**不写死路径**。所有行为由两份配置决定:

| 文件 | 谁写 | 读它做什么 |
|------|------|-----------|
| `.vscode/api-config.json` | `init` 写一次,手改 | AI 配置 + 桶导出组 + 工作流管道 + `edenPrefix` |
| `.vscode/api-gen.json` | `info` 写一次,手改覆盖 appType | 项目结构 + AppType + 聚合入口位置 |

**AppType**(`.vscode/api-gen.json` 决定)控制 link / gen-hook 行为:

| appType | modules 位置 | link 输出 | 聚合函数 |
|---------|-------------|----------|---------|
| `b2b-api` | `src/modules/` | `src/modules/index.ts` | `applyAllModules` |
| `web` | `src/server/modules/` | `src/server/index.ts` | `applyAllControllers` |
| `b2b-admin` | (无) | — | 跳过 |
| `frontend` | (无) | — | 跳过 |

`info` 命令会自动识别默认值,**用户在交互确认时可覆盖**(也可手改 `api-gen.json`)。

## §2 Eden Treaty 路径前缀 — edenPrefix

`gen-hook` 拼 eden 链式访问的根段,默认 `""`(直接挂载,无版本号):

```jsonc
// .vscode/api-config.json 或 api-gen.json
{ "edenPrefix": "" }     // eden.<domain>.<path>.<method>(tradeflow 当前)
{ "edenPrefix": "api" }  // eden.api.<domain>...(server.ts: prefix "/api")
{ "edenPrefix": "api.v1" } // eden.api.v1.<domain>...(多版本)
```

必须与 `b2b-api/src/server.ts` 里 `new Elysia({ prefix })` 保持一致。缺省 = 无 prefix。

## §3 桶导出 — barrel

两类组,行为完全不同:

**约定名组**(多个同名目录一起导出):

```jsonc
{ "exportIndex": { "includes": ["utils"], "utils": ["packages/contract/src/utils"] } }
```

**路径形式组**(整个目录一次性递归,**最常用**):

```jsonc
{ "exportIndex": { "includes": ["packages/contract/src/utils"], "packages/contract/src/utils": [] } }
```

空数组 = barrel 时自动递归展开,不需要先跑 `sync`。

| 参数 | 用途 |
|------|------|
| `--group <name>` | 只处理某组 |
| `--dry-run` | 预览不落盘 |
| `--lib` | 仅导出 `@public` 标记的符号(库入口用) |

**`init` 默认带的三组**(tradeflow):

- `utils` — 工具函数
- `packages/contract/src/drizzle` — dbschema 桶(`raw` 从这里 import,先 barrel 再 raw)
- `packages/contract/src/utils/constants/definitions` — 3 层常量字典(路径形式组)

## §4 raw — 桶路径优先,fallback 单文件

`api-gen raw` 把 `*.dbschema.ts` 的 `pgTable` 派生成 `packages/contract/src/tbschema/raw/<name>.dbschema.raw.ts`。

**import 路径策略**(通用模式 `resolveBarrelImport`):

| drizzle/index.ts | raw 生成的 import |
|------------------|-------------------|
| 存在(已跑 barrel) | `import { siteTable } from "../../drizzle"` ← 桶路径 |
| 不存在(没跑 barrel) | `import { siteTable } from "../../drizzle/table.dbschema"` ← fallback,会 warn 提示先跑 barrel |

**所以正确顺序是 `barrel` → `raw`,**不要倒过来。

## §5 gen-tbschema / gen-hook 关键参数

**`gen-tbschema`**(从 dbschema + raw 派生 tbschema 骨架):

```bash
api-gen gen-tbschema              # 全部
api-gen gen-tbschema -d site      # 只生成 site
api-gen gen-tbschema --force      # 覆盖已有骨架
```

骨架结构:`{Response, Create, Update, Patch, ListQuery, ListResponse}` + `XxxContract = InferDTO<typeof XxxTBSchema>`,需手调业务字段。

**`gen-hook`**(从 b2b-api controller 派生 Eden-TanStack-Query hook):

```bash
api-gen gen-hook              # web + b2b-admin 全部
api-gen gen-hook -d site      # 只生成 site domain
api-gen gen-hook -t web       # 只写 web(不写 b2b-admin)
api-gen gen-hook -t b2b-admin # 只写 b2b-admin
```

命名规则:`GET /current` → `useCurrent<Domain>`,`GET /:id` → `use<Domain>Detail(id)`,`POST /` → `useCreate<Domain>`,`DELETE /:id` → `useDelete<Domain>`。

## §6 硬性约束

- **CWD 必须在项目根** — 工具读 `process.cwd()` 找 `.vscode/api-config.json`,从子目录跑会失败
- **首行 marker 保护**:`barrel / link / raw / gen-tbschema / gen-hook` 生成的文件首行带 `// Auto-generated by \`api-gen <cmd>\``;**已有但无 marker 的文件视为手动维护,跳过不覆盖并 warn**
- **不要给 `index.ts` 手写内容加 marker** — 加了就被覆盖
- **改 barrel 后跑 `bun --filter @repo/contract run type-check`** 验证符号没漏

## §7 完整文档索引

| 文件 | 内容 |
|------|------|
| `docs/layers.md` | 6 个 layer 后缀(controller / service / repos / dbschema / tbschema / relation) |
| `docs/detector.md` | `detectLayout` 流程 + AppType 识别规则 |
| `docs/app-types.md` | b2b-api / web / b2b-admin / frontend 四种形态详解 |
| `docs/ast-scanner.md` | OXc 配置 + `parseTsFile` + `traverseAst` |
| `docs/scan-and-generate.md` | `scan` + `generate` 流程 |
| `docs/barrel-export.md` | 桶导出完整规范(级联规则 + 可见性过滤) |
| `docs/sync.md` | sync 行为(约定名组 vs 路径形式组) |
| `docs/testing.md` | 测试约定(fixtures/tradeflow/ + ?cb= 缓存破坏) |
| `docs/commands/link.md` | 双聚合入口决策表 |
| `docs/commands/raw.md` | dbschema → tbschema/raw/ 流程 + 桶路径策略 |
| `docs/commands/gen-tbschema.md` | 骨架生成 + raw 依赖 + `--force` 语义 |
| `docs/commands/gen-hook.md` | eden hook 命名规则 + `edenPrefix` 配置 |

## §8 常见错误(踩过的)

| 错误 | 现象 | 修正 |
|------|------|------|
| 倒过来跑:`raw` → `barrel` | raw 报"找不到 drizzle 桶",fallback 到单文件路径 | 改顺序:**先 `barrel` 再 `raw`** |
| 没跑 `info` 就跑 `link` / `gen-hook` | 报"缺少 .vscode/api-gen.json" | 先 `api-gen info` 生成 |
| 跑 `gen-hook` 报 `eden.api.v1.*` 不存在 | 没配 `edenPrefix`,但 eden 实际挂了 prefix | 在 api-gen.json 加 `edenPrefix: "api"` |
| 手写 `index.ts` 加了 marker | 下次 barrel 覆盖你的内容 | 不要加 marker;真要手写就别加 marker |
| `link` 生成文件,`health` 重复 import | b2b-api `health` 既在 applyAllModules 链里又单独 export | 当前行为:`health` 自动从链里剔除,单独 `export { healthController }` |
| 从 `apps/*` 子目录跑 | 找不到 `.vscode/api-config.json` | 切回 worktree 根 |

需要查源码或改工具时:`/home/pori/Documents/GitHub/api-gen`,所有命令在 `src/commands/`,`docs/` 里有分文件详解。
`