# Sync — 配置自动维护

`sync` 命令负责维护 `.vscode/api-config.json` 的 `exportIndex` 部分：

- 清理**已不存在**的路径
- 对**空数组**的组自动**发现**并填充
- 跑 `pipelines`（如果有）

## 两类组：约定名组 vs 路径形式组

`exportIndex.includes` 里的项分两种，sync 填充方式不同：

| 类型 | 形态 | 例 |
|------|------|----|
| **约定名组** | 单个单词（`utils` / `hooks`） | `"utils": ["src/utils", "packages/contract/src/utils"]` |
| **路径形式组** | 含 `/` 或以 `.` 开头 | `"packages/logixlysia/src": ["packages/logixlysia/src/utils", "packages/logixlysia/src/foo.ts", ...]` |

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

barrel 处理约定名组时，**每个数组项作为独立 rootDir**——每个路径各自生成组级 `index.ts`（位置在 `src/utils/index.ts`、`packages/contract/src/utils/index.ts` 等）。

## 路径形式组

组名直接是路径（一般是 CLI 库的 `src/` 根目录），sync **递归扫描**组名下所有有内容的子目录（任意深度），加上组根的散 `.ts` 文件，填进数组：

```jsonc
{
  "exportIndex": {
    "includes": ["packages/logixlysia/src"],
    "packages/logixlysia/src": [
      "packages/logixlysia/src/foo.ts",      // 组根散文件
      "packages/logixlysia/src/hooks",       // 一级子目录
      "packages/logixlysia/src/utils",       // 一级子目录
      "packages/logixlysia/src/utils/nested" // 二级子目录（递归到底）
    ]
  }
}
```

**典型场景**：CLI 库（如 `logixlysia`）的 `src/` 根目录希望**只写一行 `includes` 就自动展开所有子目录**——不用手工枚举每个子项。

### sync 行为

| 情况 | 行为 |
|------|------|
| 数组为空 | **递归**扫描：组根散文件 + 每层有内容的子目录，全部填入 |
| 数组非空 | 尊重你的清单；只过滤掉不存在的非 `!` 路径；`!` 排除项原样保留 |
| 路径不存在 | warn + 数组保持空（不报错） |

递归规则：
- **子目录**：只在"本层有散 `.ts` 文件 **或** 任一后代有内容"时才纳入
- **散 `.ts` 文件**：只在**组根那一层**纳入；深层散文件归所属子目录的 barrel 管（不上升到组根）
- **黑名单**：`SKIP_DIRS`（`node_modules` / `dist` / `.vscode` / `.git` / `scripts` / `.next` / `.agengt` / `.claude` / `.lingma` / `turbo`）全程生效

### barrel 行为

barrel 不依赖 sync 先跑——直接对**空数组的路径形式组**也自动递归展开（用同一份共享扫描工具，行为完全一致）。

barrel 处理时按**深度倒序**写各层 barrel（深的先），然后聚合时父级 barrel 通过 `from "./subdir"` 把子目录 barrel 链入，实现"递归级联"：

```
src/index.ts                  ← 父级汇总：散文件 + 一级子目录
src/utils/index.ts            ← 中间层：re-export ./nested（级联）
src/utils/nested/index.ts     ← 叶层：聚合 nested/ 下的散文件
```

这样 `import { x } from "@/contract"` / `from "@/contract/utils"` / `from "@/contract/utils/nested"` 三种深度都能用。

### 与约定名组的关键区别

| 维度 | 约定名组 | 路径形式组 |
|------|---------|-----------|
| 数组里能填几个 | 多个（每处匹配目录一个） | 一个组名下的所有子内容（子目录 + 散文件） |
| sync 填的依据 | 全项目扫名字匹配 | **递归**扫组名路径下所有有内容的子目录 + 组根散文件 |
| barrel 处理 | 每个数组项**独立**生成组级 `index.ts` | 以**组名**作为唯一 rootDir，**级联**聚合到每一层（子目录的 barrel re-export 进父级） |
| 空数组触发 | warn（没有组名路径可扫） | **自动递归展开**——barrel 不依赖 sync 先跑 |
| 多仓可重复 | ✅（每 app 一个 utils 各填一项） | ❌（路径就是身份，一处一个） |
| 散文件支持 | ❌（约定名组是目录白名单） | ✅（组根散文件自动 re-export） |

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
| 路径形式组空数组 | **递归**扫组名路径下所有有内容的子目录 + 组根散文件填入 |
| 路径形式组路径不存在 | warn + 数组保持空（不报错） |
| 路径形式组路径下无任何内容 | 数组保持空 |

## 与 barrel 的关系

`barrel` 不依赖 `sync` 先跑——空数组的路径形式组 barrel 也会自动递归展开。两者共享同一份 `scanPathGroupChildren` 工具，行为完全一致：

```bash
api-gen sync      # 维护配置（把扫描结果写回 api-config.json，方便审计）
api-gen barrel    # 生成 index.ts（不依赖 sync，可以单独跑）
```

`barrel` 还有自己的语义（`!` 排除路径、单组运行 `--group`、手动维护保护、级联 barrel），见 `docs/barrel-export.md`。
