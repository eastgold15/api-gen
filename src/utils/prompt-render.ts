import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "@visulima/path";

export type PromptTemplateVars = {
  PROJECT_NAME: string;
  STRUCTURE_TREE: string;
  DB_TABLE_LIST: string;
  DB_SCHEMA_CODE_BLOCKS: string;
  DB_RELATION_CODE_BLOCKS: string;
  CONTRACT_MODULE_LIST: string;
  CONTRACT_CODE_BLOCKS: string;
  MODEL_MODULE_LIST: string;
  MODEL_CODE_BLOCKS: string;
  APP_LIST_TEXT: string;
  API_ROUTES_JSON: string;
};

/** 读取提示词模板文件 */
export function readPromptTemplate(tplPath: string): string {
  if (!existsSync(tplPath)) {
    throw new Error("ai-prompt.template.md 不存在，请先执行 api-gen init");
  }
  return readFileSync(tplPath, { encoding: "utf-8" });
}

/** 替换占位符，渲染成品提示词 */
export function renderPromptTemplate(tpl: string, vars: PromptTemplateVars): string {
  let content = tpl;
  for (const [key, val] of Object.entries(vars)) {
    const placeholder = `{{${key}}}`;
    content = content.replaceAll(placeholder, val ?? "");
  }
  return content;
}

/** 初始化默认模板文件（init 调用） */
export function initDefaultPromptTemplate(tplPath: string) {
  if (existsSync(tplPath)) return;
  const templateContent = `# 后端分层代码生成任务

## 1. 项目基础信息

项目名称：{{PROJECT_NAME}}
多应用列表：
{{APP_LIST_TEXT}}

## 2. 项目目录分层架构

{{STRUCTURE_TREE}}

### 分层存放硬性规则

1. controller / service / model：对应 app 的 modulesDir（一个 domain 一个目录，三件套成对）
2. dbschema：packages/database/src/drizzle/*.dbschema.ts（唯一数据源）
3. raw：packages/database/src/zschema/raw/*.dbschema.raw.ts（drizzle-zod 派生）
4. zschema（**实体层**）：packages/shared-types/src/zschema/*.zschema.ts —— 只放全字段实体 schema
5. model（**HTTP 契约层**）：apps/<app>/src/modules/<domain>/<domain>.model.ts —— 放接口契约

### 契约三层分离（SSOT，不可违反）

\`\`\`
dbschema → raw（全字段 Zod）→ zschema 实体层（全字段）
                                  ↓ pick / omit / strict
                            <domain>.model.ts（HTTP 契约：body / query / params / response）
                                  ↓ controller 挂载（body / query / params / response）
                            Eden 推导 → 前端
\`\`\`

**硬性要求**

1. shared-types 的 zschema **不写 HTTP 契约** —— 不要出现 Create / Update / ListQuery / ListResponse / Response
2. HTTP 契约写在各 app 的 \`<domain>.model.ts\`，导出 \`XxxModel\`（运行时 Zod 对象）+ \`XxxModelContract\`（纯类型）
3. 命名用 \`XxxModel\` / \`XxxModelContract\`，**不要**用 Elysia 官方的 Post / Body / Delete
4. 响应一律带信封（\`ResultSchema\` / \`PageResultSchema\`），裸数组会让前端取数路径全断
5. 创建 / 更新体用**白名单**（\`.pick()\` / \`.omit()\`）排除服务端字段（id / createdAt / updatedAt / organizationId / siteId）
6. 响应用 \`.pick()\` 只暴露接口真正返回的列，别把内部列泄给前端
7. query 的数字 / 布尔必须能接字符串（\`z.coerce.number()\` 或 \`QueryShape()\`）—— Elysia 对 Zod 不做任何类型转换
8. 枚举从 raw 派生（\`RawInsert.shape.status.optional()\`），不要手写 \`z.enum([...])\` 复述 pgEnum 的值
9. 递归 schema 用 \`z.ZodType<T, T>\`（Output + Input 两个泛型）
10. controller 每个路由都要挂 \`response:\` —— 前端靠它从 Eden 推导响应类型
11. 前端**不 import** 后端 model.ts，类型一律从 Eden 推导

## 3. 全局数据库资源

全部数据表名称：{{DB_TABLE_LIST}}

### 所有 schema 完整源码

{{DB_SCHEMA_CODE_BLOCKS}}

### 所有 relation 完整源码

{{DB_RELATION_CODE_BLOCKS}}

## 4. 实体层 Zod（shared-types，只有全字段）

已有实体层模块：{{CONTRACT_MODULE_LIST}}

### 全部实体层完整源码

{{CONTRACT_CODE_BLOCKS}}

### 实体层约束

1. 只描述"表的形状"：Entity / Insert / Query（外加前后端都要用的实体类型，如 TreeEntity）
2. 不写信封、不写 Create / Update / ListQuery / ListResponse / Response
3. 实体直接复用 raw 的 \`.shape\`，不重复列字段

## 5. HTTP 契约层（各 app 的 <domain>.model.ts）

已有契约模块：{{MODEL_MODULE_LIST}}

### 全部契约层完整源码

{{MODEL_CODE_BLOCKS}}

### 契约层约束

1. 一个 domain 一个 model 文件，导出 \`XxxModel\` 对象，键与路由方法对应
2. body / query / params / response 都从这里取，controller 不内联 Zod
3. 同一 domain 的不同路由返回结构可能不同 → 允许建专用 response schema（DeleteResponse / PatchStatusResponse / BatchDeleteResponse）
4. service 用 \`XxxModelContract["Create"]\` 取入参类型，**不** import 运行时对象

## 6. 本次待生成接口清单

\`\`\`json
{{API_ROUTES_JSON}}
\`\`\`

## 7. AI 输出要求

1. 分开输出每个文件完整代码，标注文件完整路径；
2. 输出顺序：dbschema（如需改表）→ 实体层 zschema → 各 app 的 \`<domain>.model.ts\` → controller → service；
3. 已有契约直接 import，仅补充缺失部分；
4. 完整实现分页、新增、编辑、查询、删除业务闭环；
5. 接口 permissions 权限标识写入 controller 鉴权配置；
6. 多应用隔离，代码写入对应 app 目录，不跨应用混淆；
7. 数据库操作使用全局 schema 表，不重复定义表结构；
8. 只输出代码与路径说明，不写解释性散文。
`;
  writeFileSync(tplPath, templateContent);
}

/** 拼接 ts 代码块工具 */
export function buildCodeBlock(filePaths: string[], sourceTexts: string[]): string {
  if (filePaths.length === 0) return "无";
  let blocks = "";
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const code = sourceTexts[i];
    blocks += `### ${filePath}\n\`\`\`typescript\n${code}\n\`\`\`\n\n`;
  }
  return blocks.trim();
}
