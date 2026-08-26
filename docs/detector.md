# 目录探测与 AppType 识别

[`src/structure/detector.ts`](../src/structure/detector.ts) 是 `info` 命令的核心，负责把项目目录扫描成 `ApiGenRootConfig` 结构。

## 总流程

```
detectLayout(cwd)
  ├─ 读 package.json.name → projectName(否则用 basename(cwd))
  ├─ detectIsMonorepo() → hasApps || hasPackages
  ├─ scanCommonLayer(cwd) → common(公共合约层)
  ├─ buildStructureTree(cwd) → 目录树字符串
  └─ 按 isMonorepo 分支
      ├─ true  → 扫 apps/<name>/ 调 scanMonorepoApp()
      └─ false → 调 scanSingleApp() 生成虚拟 main
```

## isMonorepo 判定

```ts
existsSync(join(rootDir, "packages")) || existsSync(join(rootDir, "apps"))
```

任一存在即视为 monorepo。**注意**：必须含 `apps` 或 `packages` 顶级目录（不是 `src/apps`）。

## AppType 探测（默认值，可被配置覆盖）

`probeAppType(appRootAbs, appName)` 按以下决策表返回探测值：

| 探测点 | 命中 | appType | modulesDir | aggregateIndex |
|------|------|---------|------------|---------------|
| `appName === "b2b-admin"`（按命名约定优先） | 总是 | `b2b-admin` | `null` | `null` |
| `src/modules/<d>/<d>.controller.ts` 存在 | ✅ | `b2b-api` | `src/modules` | `src/modules/index.ts` |
| `src/server/modules/<d>/<d>.controller.ts` 存在 | ✅ | `web` | `src/server/modules` | `src/server/index.ts` |
| 只有 `src/hooks/api/` 存在 | ✅ | `frontend` | `null` | `null` |
| 都没有 | — | `frontend`（最终会被过滤掉） | `null` | `null` |

辅助函数 `hasDomainController(modulesAbs)`：扫一层子目录，找名为 `<name>/<name>.controller.ts` 的目录（跳过 `_` 开头和 `SKIP_DIRS`）。

> **不是默认值决定一切**：`info` 命令在 `askConfirm` 之后会**逐个 app 让用户从 4 个 AppType 中选**（含"跳过丢弃"选项），用户的选择写进 `.vscode/api-gen.json` 的 `apps[i].appType`，是下游所有命令（`link` / `raw` / `gen-hook`）读的真值。
> **CI 场景**：`info` 暂未提供 `--yes` 跳过交互，未来可加；当前 CI 可手写一份 `api-gen.json` 提交进版本控制。

## scanCommonLayer

`packages/contract/` 必须存在，否则 `common = null`。

扫描所有 `*.dbschema.ts` / `*.tbschema.ts` / `*.relation.ts` / `*.repos.ts`（递归），同时 AST 提取 dbschema 内的 `*Table` 变量名 → `existingSchemas`。

`tbschemaRoot` / `tbschemaRawDir` 计算优先级：
1. 已存在的 `*.tbschema.ts` → 父目录 = tbschemaRoot
2. `src/tbschema/` 目录存在 → tbschemaRoot = src/tbschema
3. `tbschema/` 目录存在 → tbschemaRoot = tbschema

两者都返回 `tbschemaRoot/raw`。

## 跳过黑名单

`SKIP_DIRS` 在多个文件里重复定义（detector / barrel / link），新增跳过项需同步。共同集合：

```
node_modules, dist, .vscode, .git, scripts, .next, .agengt, .claude, .lingma, turbo
```

> 历史小坑：`.agent` 被错写成 `.agengt`，是 tradeflow 实际目录名对应的字典；改一处会破另一处。
