import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import chalk from "chalk";
import {
  readPromptTemplate,
  renderPromptTemplate,
  buildCodeBlock,
  type PromptTemplateVars,
} from "../utils/prompt-render.js";
import type { ApiSpec } from "./scan.js";

/** 读取扫描产物 api-spec.json */
function readApiSpec(specPath: string): ApiSpec {
  const raw = readFileSync(specPath, "utf-8");
  return JSON.parse(raw) as ApiSpec;
}

/** 拼接多应用文本说明 */
function buildAppListText(apps: ApiSpec["projectContext"]["apps"]): string {
  return apps
    .map((app) => {
      return `- 应用名：${app.appName}
  controller目录：${app.controllerDir ?? "无"}
  server目录：${app.serverDir ?? "无"}`;
    })
    .join("\n");
}

export async function makePromptCommand(tag?: string, singlePath?: string) {
  const cwd = process.cwd();
  const specPath = resolve(cwd, ".vscode/api-spec.json");
  const templatePath = resolve(cwd, ".vscode/ai-prompt.template.md");
  const outputPromptPath = resolve(cwd, ".vscode/ai-prompt.md");

  // 前置文件校验
  if (!existsSync(specPath)) {
    console.error(chalk.red("错误：缺少 api-spec.json，请先执行 api-gen scan"));
    process.exit(1);
  }
  if (!existsSync(templatePath)) {
    console.error(chalk.red("错误：缺少 ai-prompt.template.md，请先执行 api-gen init"));
    process.exit(1);
  }

  const spec = readApiSpec(specPath);
  const ctx = spec.projectContext;

  // 筛选目标接口
  let targetRoutes = spec.routes;
  if (tag) targetRoutes = targetRoutes.filter((r) => r.tags.includes(tag));
  if (singlePath) targetRoutes = targetRoutes.filter((r) => r.path === singlePath);
  if (targetRoutes.length === 0) {
    console.warn(chalk.yellow("筛选后无匹配接口，终止执行"));
    return;
  }

  // 组装全局完整代码块
  const schemaCodeBlock = buildCodeBlock(ctx.db.schemaFileList, ctx.db.schemaSourceTexts);
  const relationCodeBlock = buildCodeBlock(ctx.db.relationFileList, ctx.db.relationSourceTexts);
  const contractCodeBlock = buildCodeBlock(ctx.contract.contractFileList, ctx.contract.sourceTexts);

  // 填充模板变量
  const vars: PromptTemplateVars = {
    PROJECT_NAME: spec.projectName,
    STRUCTURE_TREE: ctx.structureTree,
    DB_TABLE_LIST: ctx.db.tableNames.join(", "),
    DB_SCHEMA_CODE_BLOCKS: schemaCodeBlock,
    DB_RELATION_CODE_BLOCKS: relationCodeBlock,
    CONTRACT_MODULE_LIST: ctx.contract.moduleNames.join(", "),
    CONTRACT_CODE_BLOCKS: contractCodeBlock,
    APP_LIST_TEXT: buildAppListText(ctx.apps),
    API_ROUTES_JSON: JSON.stringify(targetRoutes, null, 2),
  };

  // 渲染输出成品提示词
  const templateText = readPromptTemplate(templatePath);
  const finalPrompt = renderPromptTemplate(templateText, vars);
  writeFileSync(outputPromptPath, finalPrompt, "utf-8");

  console.log(chalk.green("✅ 提示词文件生成完成"));
  console.log(chalk.cyan("输出路径："), chalk.underline(outputPromptPath));
  console.log(chalk.cyan("本次筛选接口数量："), targetRoutes.length);
  console.log(chalk.dim("复制 ai-prompt.md 全部内容发送给大模型即可生成全套分层代码"));
}

// 默认导出，供入口动态加载
export default async function makePrompt(args: { tag?: string; path?: string }) {
  await makePromptCommand(args.tag, args.path);
}
