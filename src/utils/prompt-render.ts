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

1. controller 路由：对应 app 的 controllersDir
2. server 业务逻辑：对应 app 的 serverDir
3. 全局 schema / relation / contract 统一放在 packages/contract

### 分层职责强制约定

1. *.controller.ts：仅声明 Elysia 接口路由，无业务逻辑；入参、出参全部从 contract 导入，禁止内联 TypeBox 实体。
2. *.server.ts：纯业务层，处理数据库 CRUD、事务、权限鉴权；函数入参、返回值统一使用契约类型。
3. *.contract.ts：存放全部 TypeBox DTO，包含请求、响应、分页、多表交叉组合实体；所有复用类型统一收敛在此，禁止分散定义。
4. *.schema.ts：Drizzle 数据表定义，业务代码不重复建表。
5. *.relation.ts：数据表外键、一对多、多对多关联。

## 3. 全局数据库资源

全部数据表名称：{{DB_TABLE_LIST}}

### 所有 schema 完整源码

{{DB_SCHEMA_CODE_BLOCKS}}

### 所有 relation 完整源码

{{DB_RELATION_CODE_BLOCKS}}

## 4. 全局可复用 TypeBox 契约

已有契约模块：{{CONTRACT_MODULE_LIST}}

### 全部 contract 完整源码

{{CONTRACT_CODE_BLOCKS}}

### 类型复用约束

1. 优先复用已有契约，禁止新建同名类型；
2. 多接口共用 DTO，统一在对应模块 contract 导出；
3. 多表联查交叉组合实体，新建 contract 类型，不内嵌在路由/业务函数；
4. controller、server 内不定义复杂 TypeBox 对象。

## 5. 本次待生成接口清单

\`\`\`json
{{API_ROUTES_JSON}}
\`\`\`

## 6. AI 输出要求

1. 分开输出每个文件完整代码，标注文件完整路径；
2. 接口 permissions 权限标识写入 server 鉴权逻辑；
3. 完整实现分页、新增、编辑、查询、删除业务闭环；
4. 已有 contract 直接 import，仅补充缺失类型；
5. 多应用隔离，代码写入对应 app 目录，不跨应用混淆；
6. 数据库操作使用全局 schema 表，不重复定义表结构。
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
