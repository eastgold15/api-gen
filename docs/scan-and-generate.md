# scan + generate 流程

`scan` 和 `generate` 是 ai 辅助生成的两端：`scan` 把现有 controller / service 抽成结构化产物供 AI 读，`generate` 调 AI 写回代码。

## scan

输入：`.vscode/api-gen.json`（包含 app 列表 + 公共合约层路径）。
输出：`.vscode/api-spec.json`。

每个 app 扫一遍 `modulesDir`（由 AppLayout 提供）下的 `<domain>/<domain>.controller.ts`，AST 提取：

- `new Elysia({ prefix })` 的 prefix（用于路由前缀）
- 链式调用 `.get/.post/.put/.patch/.delete` 的路径 + method
- 每个 handler 调用的 detail 对象（`summary` / `description` / `tags`）
- 权限 `allPermissions` / `requireDept`
- body / query / params 的 t.Object(...) 引用（用于跨文件追溯 contract）

按 `tags` 分组（`{ tagName: RouteSpec[] }`），供 `make-prompt` 按 tag 筛选。

## make-prompt

输入：`.vscode/api-gen.json` + `.vscode/api-spec.json` + `.vscode/ai-prompt.template.md`。
输出：`.vscode/ai-prompt.md`。

模板用 `{{VAR}}` 占位符，目前支持：
- `{{PROJECT_NAME}}`
- `{{STRUCTURE_TREE}}`
- `{{APPS}}`（JSON 序列化）
- `{{COMMON_LAYER}}`
- `{{ROUTES_BY_TAG}}`（`make-prompt -t <tag>` 时只填一个 tag 的路由）

筛选参数：
- `-t <tag>`：只渲染单个 tag 的路由
- `-p <path>`：只渲染含此 path 子串的路由

## generate

输入：两套配置 + 调 AI（OpenAI 兼容，强制 JSON 返回）。
输出：把 `schemaAdditions`（追加到 dbschema）/`contractAdditions`（覆盖 tbschema）写盘。

`callAI()` 在 `src/generator/ai.ts` 实现，含指数退避重试（429 / 5xx 最多 3 次）。返回 JSON 必须含 `schemaAdditions` / `contractAdditions` 数组，每项 `{ path, content }`。
