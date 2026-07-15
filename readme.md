# api-gen 基于 Oxc AST 分层扫描规范文档
## 文档概述
本文档统一规范项目目录分层命名、文件命名规则、Oxc AST 扫描逻辑、分层数据提取标准。
本工具 `api-gen` 基于 `oxc-parser` 做静态 AST 解析，放弃正则文本匹配，严格按照**分层文件约定**扫描，保证解析准确率 100%，无注释/字符串误匹配问题。

## 一、项目分层文件命名强制规范（核心规则）
### 统一文件名格式
所有业务代码文件固定格式：
`{业务模块名}.{分层标识}.ts`

### 分层标识定义对照表
| 分层标识 | 分层名称 | 文件示例 | 职责说明 |
|--------|--------|---------|---------|
| `controller` | 路由控制层 | user.controller.ts、goods.controller.ts | Elysia 路由定义、接口路径、OpenAPI 文档标签、接口权限配置 |
| `server` | 业务逻辑层 | user.server.ts、goods.server.ts | 接口对应的业务处理函数、参数校验、事务逻辑 |
| `contract` | 前后端契约类型层 | user.contract.ts、goods.contract.ts | TypeBox 类型定义：请求体、响应体、分页、创建/更新/查询模型 |
| `schema` | 数据库表结构层 | user.schema.ts、goods.schema.ts | Drizzle ORM 数据表定义 `export const xxxTable = pgTable()` |
| `relation` | 表关联关系层 | user.relation.ts、goods.relation.ts | 数据表外键、联表关联、JOIN 关系定义 |

### 目录存放约定（多仓 monorepo 固定结构）
```
项目根目录
├── packages
│   └── contract
│       ├── src
│       │   ├── drizzle
│       │   │   ├── *.schema.ts    // 数据表定义
│       │   │   └── *.relation.ts  // 表关联关系
│       │   └── modules
│       │       └── *.contract.ts // TypeBox 接口契约
└── apps
    └── b2b-api
        └── src
            ├── controllers
            │   └── *.controller.ts // Elysia 路由控制器
            └── server
                └── *.server.ts     // 业务逻辑处理层
```

### 过滤扫描黑名单（自动跳过，不解析）
扫描根目录时自动忽略以下目录，不进入递归解析：
`node_modules`、`dist`、`.vscode`、`.git`、`scripts`

## 二、Oxc Parser 统一解析配置标准
所有分层 TS 文件共用一套解析配置，固定参数，无需差异化调整
```typescript
import { parseSync, ParseResult } from "oxc-parser";
import fs from "node:fs";
import path from "node:path";

/**
 * 统一TS文件AST解析函数，全分层通用
 * @param fileAbsPath 文件绝对路径
 */
export function parseTsFile(fileAbsPath: string): ParseResult {
  const sourceCode = fs.readFileSync(fileAbsPath, "utf-8");
  const fileName = path.basename(fileAbsPath);

  return parseSync(fileName, sourceCode, {
    lang: "ts",
    sourceType: "module",
    astType: "ts",
    range: false,
    preserveParens: true,
    showSemanticErrors: false,
  });
}
```
### 配置参数说明
1. `lang: "ts"`：开启完整TS语法、自动支持装饰器、泛型、Drizzle/TypeBox 类型语法
2. `sourceType: "module"`：项目统一 ESM，提升解析速度
3. `astType: "ts"`：保留TS专属AST节点，用于提取表、契约、路由类型
4. `range: false`：不生成字符偏移，减少内存占用，纯静态提取无需行列定位
5. `preserveParens: true`：保留括号节点，防止嵌套路由/表配置解析丢失结构
6. `showSemanticErrors: false`：关闭语义校验，半成品代码也可正常提取有效节点

## 三、分层扫描工具通用能力
### 3.1 递归目录扫描工具
按分层后缀过滤文件，只解析规范命名文件，过滤黑名单目录
```typescript
/**
 * 递归扫描目录，筛选指定分层后缀文件
 * @param rootDir 扫描根目录
 * @param layerSuffix 分层后缀 controller / server / contract / schema / relation
 */
export function scanLayerFiles(rootDir: string, layerSuffix: string): string[] {
  const fileList: string[] = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const blackDirs = new Set(["node_modules", "dist", ".vscode", ".git", "scripts"]);

  for (const entry of entries) {
    const fullPath = path.resolve(rootDir, entry.name);
    // 跳过黑名单文件夹
    if (entry.isDirectory()) {
      if (blackDirs.has(entry.name)) continue;
      fileList.push(...scanLayerFiles(fullPath, layerSuffix));
    }
    // 匹配规范分层文件：xxx.{layerSuffix}.ts
    if (entry.isFile() && entry.name.endsWith(`.${layerSuffix}.ts`)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}
```

### 3.2 通用AST递归遍历工具
全分层统一AST遍历逻辑，用于匹配变量、函数、类、调用表达式
```typescript
type AstNode = Record<string, any>;
/** 深度优先遍历AST所有节点 */
export function traverseAst(root: AstNode, enter: (node: AstNode) => void) {
  if (!root || !root.type) return;
  enter(root);
  for (const key of Object.keys(root)) {
    const val = root[key];
    if (Array.isArray(val)) val.forEach(child => traverseAst(child, enter));
    else if (val && typeof val.type === "string") traverseAst(val, enter);
  }
}

/** 提取字符串字面量值（普通字符串/无插值模板字符串） */
export function getStrValue(node: AstNode): string | null {
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral" && node.quasis.length === 1) return node.quasis[0].value.raw;
  return null;
}

/** 读取对象字面量指定key的子节点 */
export function getObjProp(objNode: AstNode, propName: string): AstNode | null {
  if (objNode.type !== "ObjectExpression") return null;
  for (const prop of objNode.properties) {
    const key = prop.key;
    let name = "";
    if (key.type === "Identifier") name = key.name;
    if (key.type === "StringLiteral") name = key.value;
    if (name === propName) return prop.value;
  }
  return null;
}
```

## 四、各分层独立AST提取规范
### 4.1 controller 路由控制层（*.controller.ts）
#### 扫描入口
`scanLayerFiles(cwd, "controller")`
#### AST 提取目标
1. `NewExpression`：`new Elysia({ prefix: "/xxx" })`
   - 提取控制器变量名、全局路由前缀 `prefix`
2. `CallExpression`：`.get() / .post() / .put() / .patch() / .delete()`
   - 请求方法、接口路径
   - 第三个参数 `detail`：summary、description、tags 接口文档信息
   - 第三个参数 `allPermissions`：接口权限标识数组
#### 输出结构
```typescript
export interface RouteSpec {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  permissions: string[];
}
export interface ControllerSpec {
  name: string;
  prefix: string;
  routes: RouteSpec[];
}
```

### 4.2 schema 数据表层（*.schema.ts）
#### 扫描入口
`scanLayerFiles(cwd, "schema")`
#### AST 提取目标
`VariableDeclaration` 导出常量，变量名以 `Table` 结尾
示例：`export const userTable = pgTable("user", {...})`
- 提取所有表名，读取完整表定义代码片段用于AI上下文生成
#### 输出：`string[]` 数据表名称数组

### 4.3 relation 表关联层（*.relation.ts）
#### 扫描入口
`scanLayerFiles(cwd, "relation")`
#### AST 提取目标
识别外键关联函数、relation 关联配置，读取完整源码片段，作为AI生成关联逻辑上下文

### 4.4 contract 前后端契约层（*.contract.ts）
#### 扫描入口
`scanLayerFiles(cwd, "contract")`
#### AST 提取目标
所有 TypeBox 导出类型：
`t.Object() / t.Array() / t.String()` 等请求、响应、分页类型
读取完整文件代码片段，提供给AI复用现有类型，避免重复生成

### 4.5 server 业务逻辑层（*.server.ts）
#### 扫描入口
`scanLayerFiles(cwd, "server")`
#### AST 提取目标
业务处理函数、入参/出参类型引用，可扩展用于校验接口逻辑完整性

## 五、全局项目结构探测逻辑（init 命令专用）
### 执行流程
1. 基于固定目录约定，调用分层扫描函数分别读取5层文件
2. 收集：数据表名、契约文件名、控制器路径、schema/relation 文件路径
3. 组装 `ProjectLayout` 结构，交互式确认后写入 `.vscode/api-gen.json` 持久化配置
4. 后续 `scan` / `generate` 命令直接读取配置，无需重复全局扫描

### ProjectLayout 核心结构定义
```typescript
export interface ProjectLayout {
  contractDir: string | null;
  schemaPath: string | null;
  relationPath: string | null;
  dtoDir: string | null;
  controllersDir: string | null;
  serverDir: string | null;
  existingSchemas: string[]; // 从*.schema.ts提取的表名
  existingContracts: string[]; // *.contract.ts 文件名
}
```

## 六、scan 命令执行标准流程
1. 读取 `.vscode/api-gen.json` 配置，获取控制器目录路径
2. 调用 `scanLayerFiles(controllersDir, "controller")` 批量读取路由文件
3. 循环解析每个 controller 文件，AST 提取全部路由信息
4. 扁平化所有路由，按 tags 标签分组统计
5. 生成 `api-spec.json` 接口完整规格文件，存入 `.vscode` 目录

## 七、generate AI 代码生成标准流程
1. 读取 `.vscode/api-gen.json` 项目结构配置 + `.vscode/api-spec.json` 接口路由
2. 分层读取 schema / relation / contract 源码片段，组装项目上下文
3. 自动识别项目通用数据表字段（遍历所有schema AST提取公共列）
4. 按接口标签分组，构造标准化AI提示词
5. 调用 DeepSeek/OpenAI 生成新增 schema 表、contract 契约代码
6. 文件写入规则：
   - schema 文件：存在则追加新表代码，不存在新建
   - contract 文件：直接覆盖生成完整类型文件

## 八、规范带来的核心优势
1. **解析零误判**：依靠固定文件分层后缀过滤，只解析目标业务文件，不会扫描无关脚本、配置
2. **AST 解析稳定可靠**：放弃脆弱正则，Oxc 完整TS语法解析，注释、字符串内伪代码不会误捕获
3. **分层职责隔离**：每层只提取对应业务数据，逻辑清晰易维护、易扩展
4. **适配多仓项目**：严格匹配现有 apps/packages 目录结构，开箱即用无需自定义路径配置
5. **可扩展**：新增分层只需新增后缀、新增一套AST匹配逻辑，整体架构无需重构

## 九、扩展开发规范
1. 新增分层：只需新增分层标识，新增一套独立扫描+AST提取逻辑
2. AST 新增提取需求：在 `traverseAst` 回调中增加节点类型判断即可
3. 代码打印格式化：如需修改AST后输出源码，搭配 `esrap` 格式化TS代码
4. 语法容错：Oxc 解析遇到局部语法错误仅打印警告，正常提取无错误的有效AST节点，不会中断整体扫描