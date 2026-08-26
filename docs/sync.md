# sync

`sync` 干两件事：
1. 执行 `api-config.json` 的 `pipelines`（文件转换管道）
2. 扫描目录填充 `exportIndex` 各组路径

## pipelines

```json
"pipelines": [
  [
    { "type": "select", "glob": "**/*.tbschema.ts" },
    { "type": "prepend", "content": "/** biome-ignore-all lint/style/useNamingConvention: 契约文件固定约束 */" }
  ]
]
```

每条管道是步骤数组，按顺序执行：
- `select`（`glob`）— 选文件
- `prepend`（`content`）— 文件头插入内容
- `append`（`content`）— 文件尾追加内容
- `replace`（`from` / `to`）— 文本替换

目前 `init` 默认给 `*.tbschema.ts` 加 biome-ignore 头（TypeBox 契约里的 `XxxTBSchema` 大写无法绕过 lint）。

## exportIndex 填充

`sync` 遍历 `includes` 数组，按组名分两类处理：

### 约定名组（utils / hooks / helpers / ...）

- 读 `current[name]`（已显式配置的路径）
- 若非空：保留 `!` 排除项 + 移除已不存在的目录
- 若为空：用 `scanBarrelDirs` 自动扫所有同名目录

`scanBarrelDirs` 在项目根下递归找 `utils/` / `hooks/` 等 BARREL_TARGETS 目录（见 [`src/commands/sync.ts`](../src/commands/sync.ts) 的 `BARREL_TARGETS`），跳过 `SKIP_DIRS`。

### 路径形式组（含 `/` 或以 `.` 开头）

- 读 `current[name]`（已显式配置的路径列表）
- 若非空：保留 `!` 排除项 + 移除已不存在的目录
- 若为空 + 路径存在：用 `scanPathGroupChildren` 递归填**所有有内容的子目录 + 组根散 .ts 文件**

`scanPathGroupChildren` 的输出是该路径下：
- 一级子目录里**至少有一个 .ts 文件**或**非空子目录**的路径
- 组根直接放的 `.ts` 散文件

> **孙级不直接出现**：`./x/sub/sub-sub/` 不会出现在 `["x"]` 的子项里，而是经 `./x/sub/index.ts` 间接暴露。

## 移除失效目录

不管约定名还是路径形式组，`sync` 都校验每个非 `!` 项 `existsSync`：
- 已存在 → 保留
- 不存在 → 移除

## 完整 run

```bash
api-gen sync
# 1. 执行 pipelines(每个文件按管道步骤处理)
# 2. 更新 exportIndex(填充 / 清理)
```
