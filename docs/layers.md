# 分层文件命名规范

`api-gen` 全部扫描都基于"文件后缀即分层"的约定。约定集中在 [`src/utils/tree-builder.ts:LAYERS`](../src/utils/tree-builder.ts)，是其他模块（detector / barrel / scan）的真源。

## LAYERS 数组

```ts
export type Layer = "controller" | "service" | "repos" | "dbschema" | "tbschema" | "relation";
export const LAYERS: Layer[] = ["controller", "service", "repos", "dbschema", "tbschema", "relation"];
```

注意：常量字典 `def` 不在 LAYERS 数组里（不参与 tree-builder 的目录着色），但被 barrel 识别并触发 3 层导出。

## 6 个 layer

| layer | 文件格式 | 抽取目标 | 所在位置 |
|------|---------|---------|---------|
| `controller` | `<domain>.controller.ts` | `new Elysia({prefix}).<method>(path, opts, handler)` 链 | `apps/<app>/src/modules/<domain>/`（b2b-api）<br> `apps/<app>/src/server/modules/<domain>/`（web） |
| `service` | `<domain>.service.ts` | `class XxxService { ... }` 业务方法 | 同 controller 同目录 |
| `repos` | `<domain>.repos.ts` | Drizzle 查询函数 / 类 | 同 controller 同目录 |
| `dbschema` | `<name>.dbschema.ts` | `pgTable(...)` 导出变量 | `packages/contract/src/drizzle/` |
| `tbschema` | `<name>.tbschema.ts` | `XxxTBSchema` 对象 + `XxxContract = InferDTO<...>` 类型 | `packages/contract/src/tbschema/` |
| `relation` | `<name>.relation.ts` | Drizzle relations() 导出 | `packages/contract/src/` |

## 3 层常量字典（`def`）

不在 LAYERS 数组但被 barrel 识别（`packages/contract/src/utils/constants/definitions/*.def.ts`）：

```ts
export const STATUS_DEF = { ACTIVE: "active", INACTIVE: "inactive" } as const;
export const STATUS_OPTIONS = [{ value: "active", label: "启用" }, ...] as const;
export const STATUS_GROUPS = [{ value: "all", label: "全部" }, ...] as const;
```

barrel 在生成该子目录 `index.ts` 时，**不展开**这些常量（不像 service / interface 那样 export 类型 + 值），而是 re-export 整个 `<name>.def.ts` 模块——保证 IDE 跳转与原始定义一致。

## 文件名约定细节

- **kebab-case**：`<domain>` 在 controller / service / repos 路径里推荐 kebab（`hero-card` → `hero-card.controller.ts`），Pascal（`HeroCard`）不推荐，因为 detector 提取 domain 时要从变量名反推。
- **PascalCase**：`XxxController` 风格的变量名要 camelCase（`heroCardController`），link 命令会按 `camelCase` 校验并 warn 非驼峰。
- **dbschema 表名后缀**：所有 `pgTable` 导出变量必须以 `Table` 结尾（`siteTable` / `customerTable`），因为 raw / gen-tbschema 的命名派生都依赖这个后缀。
- **tbschema 名 = dbschema 名（去掉 Table）**：`siteTable` ↔ `site.tbschema.ts` ↔ `siteTBSchema`。
