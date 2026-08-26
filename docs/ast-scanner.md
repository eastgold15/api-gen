# AST 解析底座

[`src/utils/ast-scanner.ts`](../src/utils/ast-scanner.ts) 是所有扫描的公共底座。任何新增提取需求（不限于 controller / dbschema）都应在这里加工具函数，**绝不要在业务模块里直接 `parseTsFile` + 手写 `traverseAst`**。

## OXc 解析配置

```ts
import { parseSync } from "oxc-parser";

export function parseTsFile(filePath: string) {
  const source = readFileSync(filePath, "utf-8");
  const { program, errors } = parseSync(source, {
    sourceFilename: filePath,
    lang: "ts",
    showSemanticErrors: false,
  });
  return { program, errors };
}
```

关键选项：
- `lang: "ts"` — TypeScript 语法（支持 enum / namespace / 装饰器等）。
- `showSemanticErrors: false` — **容错半成品代码**：tradeflow 业务代码常含未导入的 type、tsconfig path 别名，OXc 在 strict mode 下会爆错。关掉后只保留语法错。
- **不传 `sourceType: "module"`**：OXc 默认 ESM，配合 `import` 语句的 `.js` 后缀，匹配项目实际 ESM-only 设置。

## traverseAst

```ts
export function traverseAst(program: any, visitor: (node: any, parent: any) => void): void {
  walk(program, null);
  function walk(node: any, parent: any) {
    if (!node || typeof node !== "object") return;
    visitor(node, parent);
    for (const key in node) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c, node);
      } else if (child && typeof child === "object" && typeof child.type === "string") {
        walk(child, node);
      }
    }
  }
}
```

深度优先遍历整棵 AST。回调签名 `(node, parent) => void`，遇到 `parent.declarations?.[0]?.init` 这种深链判定时用 parent 避免重新 walk 找父。

## 抽取新语法的标准流程

1. 写一段最小样例（用真实 tradeflow 业务代码做 ground truth）。
2. 在 `parseTsFile + traverseAst` 的回调里加节点类型判断。
3. 用 `console.log` 打出命中节点的 `type` + 关键字段，确认匹配。
4. 写成命名函数（`extractXxx(filePath)`）放 ast-scanner.ts 旁边的新文件。
5. 在 `__tests__/` 加 AST 抽取的纯函数测试（Mode A，不依赖任何目录结构）。

## 不要做的反模式

- ❌ **正则匹配 `export const xxx = new Elysia`**：会被 JSDoc 注释、字符串里的伪代码、模板字符串里的示例代码命中。
- ❌ **`readFileSync` 后 `string.includes` 判断关键字**：同上，注释/字符串会污染。
- ❌ **直接 `require("typescript").createSourceFile`**：OXc 更快（rust 编译），且不需要 `tsconfig.json` 上下文。
- ❌ **try/catch 包裹整段 traverseAst 来"容错"**：OXc 已经会跳过 syntax error 节点，try/catch 反而把真正的逻辑 bug 吞掉。
