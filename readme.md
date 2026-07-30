# api-gen

> 基于 **OXc AST 静态解析** 的后端脚手架 CLI，服务于 **Elysia + Drizzle + TypeBox** 分层项目。

`api-gen` 扫描按约定命名的分层文件（`*.controller.ts` / `*.service.ts` / `*.schema.ts` / `*.contract.ts` / `*.relation.ts`），自动生成桶导出、控制器聚合、raw DTO，并能组装 AI 提示词或直接调用 AI 生成分层代码。

全程使用 AST 解析，**绝不用正则匹配业务代码**，注释和字符串里的伪代码不会被误捕获。

## 安装

```bash
bun run build   # packem 打包 + npm link，本地全局可用 api-gen
```

要求 Node >= 18；本仓库开发使用 Bun。

## 快速开始

```bash
api-gen init          # 1. 生成 .vscode/api-config.json（填入 AI 密钥、配置 barrel 导出组）
api-gen sync          # 2. 扫描目录，填充 exportIndex 路径、执行工作流管道
api-gen info          # 3. 探测项目结构 → .vscode/api-gen.json（交互确认）
api-gen scan          # 4. 扫描 Elysia 路由 → .vscode/api-spec.json
api-gen make-prompt   # 5. 渲染 AI 提示词 → .vscode/ai-prompt.md
api-gen generate      # 6.（可选）直接调用 AI 生成 schema / contract 代码
```

## 命令一览

| 命令 | 作用 |
|------|------|
| `init` | 生成 CLI 脚本配置 `.vscode/api-config.json`（AI 配置、barrel 导出组、工作流管道） |
| `sync` | 扫描目录更新 `exportIndex` 路径（移除失效目录），并执行 `pipelines` 工作流 |
| `info [dir]` | 检测项目结构，生成 `.vscode/api-gen.json` + AI 提示词模板 |
| `scan` | AST 扫描 Elysia 控制器路由，生成 `.vscode/api-spec.json` |
| `make-prompt` | 基于模板 + 扫描产物渲染 `.vscode/ai-prompt.md`（`-t` 按标签、`-p` 按路径筛选） |
| `generate` | 逐业务模块调用 AI 生成数据表 / 契约代码（`-o` 指定输出目录） |
| `barrel` | 扫描目录生成级联 `index.ts` 桶导出，Tree Shaking 友好（`-g` 指定组、`-d` 预览） |
| `link` | 生成 `controllers/index.ts`，聚合导出 `applyAllControllers()` |
| `raw` | 解析 drizzle schema，生成 `dto/raw/*.raw.ts` 基础字段定义 |

## 配置文件

所有产物落在项目的 `.vscode/` 目录：

- **`api-config.json`**（`init` 生成）— CLI 脚本配置：AI 服务商密钥、`exportIndex` 桶导出组、`pipelines` 工作流。
- **`api-gen.json`**（`info` 生成）— 给 AI 看的项目结构：应用列表、公共合约层、目录结构树。
- **`api-spec.json`**（`scan` 生成）— 路由规格扫描产物。

## 分层文件约定

业务文件固定命名 `{模块名}.{分层}.ts`：

| 分层 | 职责 |
|------|------|
| `controller` | Elysia 路由定义、接口路径、OpenAPI 标签、权限配置 |
| `service` | 业务逻辑、CRUD、事务、鉴权 |
| `contract` | TypeBox 请求/响应/分页类型定义 |
| `schema` | Drizzle 数据表 `pgTable()` 定义 |
| `relation` | 数据表外键、联表关联 |

Monorepo 下公共合约层固定在 `packages/contract`，应用在 `apps/*`。

## 文档

- [架构与 AST 分层扫描规范](./docs/architecture.md) — 设计原理、OXc 解析配置、各分层提取标准
- [桶导出说明](./docs/barrel-export.md)

## License

MIT
