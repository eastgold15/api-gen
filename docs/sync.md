# Sync — 配置自动维护

`sync` 命令负责维护 `.vscode/api-config.json` 的 `exportIndex` 部分：

- 清理**已不存在**的路径
- 对**空数组**的组自动**发现**并填充
- 跑 `pipelines`（如果有）

## 两类组：约定名组 vs 路径形式组

`exportIndex.includes` 里的项分两种，sync 处理方式不同：

| 类型 | 形态 | 例 |
|------|------|----|
| **约定名组** | 单个单词（`utils` / `hooks`） | `"utils": ["src/utils", "packages/contract/src/utils"]` |
| **路径形式组** | 含 `/` 或以 `.` 开头 | `"packages/logixlysia/src": ["packages/logixlysia/src"]` |

判断函数（实现细节）：

```ts
function isPathLike(s: string): boolean {
  return s.includes("/") || s.includes("\\") || s.startsWith(".");
}
```

## 约定名组

`utils`、`hooks`、`helpers` 等名字命中硬编码白名单 `BARREL_TARGETS`：

```ts
const BARREL_TARGETS = new Set([
  "utils", "hooks", "helpers", "constants", "types",
  "schemas", "validators", "middleware",
]);
```

sync 会**全项目递归**扫所有目录，把名字命中白名单的目录路径塞进对应组：

```json
{
  "exportIndex": {
    "includes": ["utils"],
    "utils": [
      "src/utils",                           // 单仓
      "packages/contract/src/utils",         // monorepo
      "apps/admin/src/utils"                 // monorepo 多 app
    ]
  }
}
```

**典型场景**：单仓 / monorepo 中多处 `utils` 目录想一起导出。

## 路径形式组

组名直接是路径（一般是 CLI 库的 `src/` 根目录），sync 把**组名本身**作为唯一项填入：

```jsonc
{
  "exportIndex": {
    "includes": ["packages/logixlysia/src"],
    "packages/logixlysia/src": [
      "packages/logixlysia/src"  // ← sync 填入的
    ]
  }
}
```

然后 `barrel` 跑时以这个组名作为 `rootDir` 扫描其下一级内容：

- 一级**子目录**（`utils/`、`hooks/`）→ 各自生成 `index.ts`
- **散 `.ts` 文件**（`foo.ts`、`bar.ts`）→ 直接 re-export
- 父级 `src/index.ts` 汇总所有子目录 + 散文件
- **不递归**到孙子级（孙级由孙级自己的 barrel 处理）

sync 在日志里会把组下的子内容**列出来**（仅打印，不写进 config）：

```
✓ packages/logixlysia/src: 路径有效，将作为根目录处理（4 个子项）
  - packages/logixlysia/src/bar.ts
  - packages/logixlysia/src/foo.ts
  - packages/logixlysia/src/hooks
  - packages/logixlysia/src/utils
```

**典型场景**：CLI 库（如 `logixlysia`）的 `src/` 根目录希望每个子模块都集中导出，同时 `src/index.ts` 作为对外总入口。

### 与约定名组的关键区别

| 维度 | 约定名组 | 路径形式组 |
|------|---------|-----------|
| 数组里能填几个 | 多个（每处匹配目录一个） | 只有一个 = 组名本身 |
| sync 填的依据 | 全项目扫名字匹配 | 检查路径是否存在 |
| barrel 处理 | 每个数组项**独立**生成组级 `index.ts` | 以**组名**作为唯一 rootDir |
| 多仓可重复 | ✅（每 app 一个 utils 各填一项） | ❌（路径就是身份，一处一个） |

## 失效路径清理

sync 跑时，对每个 `existingPaths` 非空的组，会 `existsSync` 校验每项，**不存在的会移除**：

```jsonc
// 之前
{ "utils": ["src/utils", "apps/api/src/utils"] }
// 删了 apps/api/src/utils 后跑 sync：
{ "utils": ["src/utils"] }
```

日志会提示：

```
utils: 保留 1 个路径，移除 1 个失效路径
```

## 边界情况

| 配置 | sync 行为 |
|------|----------|
| `includes` 空 | 跳过整个 sync（warn） |
| 约定名组空数组 | 用全项目扫描结果填充；扫不到则保持空 |
| 路径形式组空数组 | 检查路径是否存在，存在则填 `[组名]`，不存在则 warn + 保持空 |
| 路径形式组路径不存在 | warn + 数组保持空（不报错） |
| 路径形式组路径下无任何内容 | 填 `[组名]`，barrel 跑出空 index.ts |

## 与 barrel 的关系

sync 写完配置后必须跑 `barrel` 才真正生成 `index.ts`：

```bash
api-gen sync      # 维护配置
api-gen barrel    # 生成 index.ts
```

`barrel` 还有自己的语义（`!` 排除路径、单组运行 `--group`、手动维护保护），见 `docs/barrel-export.md`。
