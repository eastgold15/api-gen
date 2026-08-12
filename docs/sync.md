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

组名直接是路径（一般是 CLI 库的 `src/` 根目录），sync 把**组名下的一级子内容**（子目录 + 散 `.ts` 文件）填进数组：

```jsonc
{
  "exportIndex": {
    "includes": ["packages/logixlysia/src"],
    "packages/logixlysia/src": [
      "packages/logixlysia/src/utils",       // 子目录
      "packages/logixlysia/src/hooks",       // 子目录
      "packages/logixlysia/src/foo.ts",      // 散文件
      "packages/logixlysia/src/bar.ts"       // 散文件
    ]
  }
}
```

**数组里能看到所有要处理的内容**——方便审计、找错。

barrel 处理路径形式组时：
- 以**组名作为唯一 rootDir**（`packages/logixlysia/src`）
- 对数组里**每一项**用 `statSync` 自识别是文件还是目录：
  - **文件**（`.ts`）→ 直接 AST 提取导出，不写 `index.ts`
  - **目录** → 当作子模块处理，生成该子目录的 `index.ts`
- 所有项汇总到 `src/index.ts`（组级）

sync 跑完日志示例：

```
✓ packages/logixlysia/src: 填充 4 个子项
  - packages/logixlysia/src/bar.ts
  - packages/logixlysia/src/foo.ts
  - packages/logixlysia/src/hooks
  - packages/logixlysia/src/utils
```

barrel 跑完生成：

```
src/index.ts                  ← 父级汇总：散文件 re-export + 子目录转发
src/utils/index.ts            ← 子模块 barrel（paginate 等）
src/hooks/index.ts            ← 子模块 barrel（useFoo 等）
```

**典型场景**：CLI 库（如 `logixlysia`）的 `src/` 根目录希望每个子模块都集中导出 + 散文件直接 re-export + `src/index.ts` 作为对外总入口。

### 与约定名组的关键区别

| 维度 | 约定名组 | 路径形式组 |
|------|---------|-----------|
| 数组里能填几个 | 多个（每处匹配目录一个） | 一个组名下的所有子内容（子目录 + 散文件） |
| sync 填的依据 | 全项目扫名字匹配 | 扫组名路径下一级内容 |
| barrel 处理 | 每个数组项**独立**生成组级 `index.ts` | 以**组名**作为唯一 rootDir，数组项识别后汇总到组级 |
| 多仓可重复 | ✅（每 app 一个 utils 各填一项） | ❌（路径就是身份，一处一个） |
| 散文件支持 | ❌（约定名组是目录白名单） | ✅（自动 re-export） |

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
| 路径形式组空数组 | 扫组名路径下一级内容填入 |
| 路径形式组路径不存在 | warn + 数组保持空（不报错） |
| 路径形式组路径下无任何内容 | 数组保持空 |

## 与 barrel 的关系

sync 写完配置后必须跑 `barrel` 才真正生成 `index.ts`：

```bash
api-gen sync      # 维护配置
api-gen barrel    # 生成 index.ts
```

`barrel` 还有自己的语义（`!` 排除路径、单组运行 `--group`、手动维护保护），见 `docs/barrel-export.md`。
