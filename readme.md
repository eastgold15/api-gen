# api-gen

> 基于 **OXc AST 静态解析** 的后端脚手架 CLI。
> 服务于 **Elysia + Drizzle + TypeBox** + Elysia Eden TanStack Query 的分层项目。

`api-gen` 扫描按约定命名的分层文件，自动生成桶导出、控制器聚合、raw DTO、TypeBox 契约骨架、Eden-TanStack-Query hook 骨架，并能组装 AI 提示词或直接调用 AI 生成分层代码。

全程使用 AST 解析，**绝不用正则匹配业务代码**——注释和字符串里的伪代码不会被误捕获。

## 安装

```bash
bun run build   # packem 打包 + npm link，本地全局可用 api-gen
```

要求 Bun（开发与运行时）。

## 快速开始

```bash
api-gen init             # 1. 生成 .vscode/api-config.json（AI 密钥、barrel 组、流水线）
api-gen sync             # 2. 扫描目录填充 exportIndex 路径、执行 pipelines
api-gen info             # 3. 探测项目结构 → .vscode/api-gen.json（交互确认 AppType）
api-gen scan             # 4. AST 扫描 Elysia 路由 → .vscode/api-spec.json
api-gen make-prompt      # 5. 渲染 AI 提示词 → .vscode/ai-prompt.md
api-gen generate         # 6.（可选）调 AI 生成 dbschema / tbschema

# 增量生成（任选）
api-gen raw                    # *.dbschema.ts → tbschema/raw/*.dbschema.raw.ts
api-gen gen-tbschema      # dbschema + raw → *.tbschema.ts 骨架
api-gen link                   # 聚合 controllers → applyAllModules / applyAllControllers
api-gen gen-hook          # b2b-api controllers → web/b2b-admin Eden-TanStack hooks
api-gen barrel                 # 级联桶导出 index.ts
api-gen archive                # 打包成 .tar.gz 部署
```

## 命令一览

| 命令 | 作用 |
|------|------|
| `init` | 生成 `.vscode/api-config.json` |
| `sync` | 填充 `exportIndex` 路径 + 执行 `pipelines` |
| `info [dir]` | 探测项目结构 → `.vscode/api-gen.json`（交互确认 AppType） |
| `scan` | Elysia 路由 → `.vscode/api-spec.json` |
| `make-prompt` | 模板 + 扫描产物 → `.vscode/ai-prompt.md` |
| `generate` | AI 生成 dbschema / tbschema |
| `raw` | dbschema → `tbschema/raw/*.dbschema.raw.ts` |
| `gen-tbschema` | dbschema + raw → `*.tbschema.ts` 骨架（`--force` 覆盖） |
| `link` | b2b-api → `applyAllModules`,web → `applyAllControllers` |
| `gen-hook` | b2b-api controllers → Eden-TanStack hooks（`--domain` 单域,`--target` web/b2b-admin） |
| `barrel` | 级联桶导出（`-g` 组,`-d` 预览,`--lib` 仅导出 `@public`） |
| `archive` | 项目目录打包 `.tar.gz` |

## 配置文件

所有产物落在项目的 `.vscode/` 目录：

- **`api-config.json`**（`init`）— CLI 脚本配置：AI 密钥、`exportIndex` 桶导出组、`pipelines` 工作流。
- **`api-gen.json`**（`info`）— 给 AI 看的项目结构：应用列表 + AppType、公共合约层、目录结构树。
- **`api-spec.json`**（`scan`）— 路由规格扫描产物。
- **`ai-prompt.template.md`**（`info`）— AI 提示词模板（占位符 `{{VAR}}`）。
- **`ai-prompt.md`**（`make-prompt`）— 渲染后的成品提示词。

## 分层文件约定

业务文件固定格式 `{模块名}.{分层}.ts`：

| 分层 | 职责 | 命名 |
|------|------|------|
| `controller` | Elysia 路由 | `<domain>.controller.ts` |
| `service` | 业务逻辑、CRUD、事务 | `<domain>.service.ts` |
| `repos` | Drizzle 数据访问层 | `<domain>.repos.ts` |
| `dbschema` | Drizzle `pgTable` 表定义 | `<name>.dbschema.ts` |
| `tbschema` | TypeBox 契约（请求/响应/查询） | `<name>.tbschema.ts` |
| `relation` | 外键/联表关联 | `<name>.relation.ts` |
| `def` | 3 层常量字典（DEF + OPTIONS + GROUPS） | `<name>.def.ts` |

Monorepo 下公共合约层固定在 `packages/contract`，应用在 `apps/*`。

## 文档

- [分层与扫描规范](./docs/layers.md)
- [目录探测与 AppType 识别](./docs/detector.md)
- [四种 AppType 形态](./docs/app-types.md)
- [AST 解析底座](./docs/ast-scanner.md)
- [桶导出](./docs/barrel-export.md) · [sync](./docs/sync.md)
- [命令:link](./docs/commands/link.md) · [raw](./docs/commands/raw.md) · [gen-tbschema](./docs/commands/gen-tbschema.md) · [gen-hook](./docs/commands/gen-hook.md)
- [scan + generate 流程](./docs/scan-and-generate.md)
- [测试规范](./docs/testing.md)

## License

MIT
