import { resolve } from "@visulima/path";
import { existsSync } from "node:fs";
import { readFileSync, writeFileSync } from "@visulima/fs";
import chalk from "@visulima/colorize";
import { boxen } from "@visulima/boxen";
import { format } from "@visulima/fmt";
import {
  readPromptTemplate,
  renderPromptTemplate,
  buildCodeBlock,
  type PromptTemplateVars,
} from "../utils/prompt-render.js";
import type { ApiSpec } from "./scan.js";

function readApiSpec(specPath: string): ApiSpec {
  const raw = readFileSync(specPath, { encoding: "utf-8" });
  return JSON.parse(raw) as ApiSpec;
}

function buildAppListText(apps: ApiSpec["projectContext"]["apps"]): string {
  return apps
    .map((app) => {
      return format("- 应用名：%s\n  controller目录：%s\n  server目录：%s", [
        app.appName,
        app.controllerDir ?? "无",
        app.serverDir ?? "无",
      ]);
    })
    .join("\n");
}

export async function makePromptCommand(tag?: string, singlePath?: string) {
  const cwd = process.cwd();
  const specPath = resolve(cwd, ".vscode/api-spec.json");
  const templatePath = resolve(cwd, ".vscode/ai-prompt.template.md");
  const outputPromptPath = resolve(cwd, ".vscode/ai-prompt.md");

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

  let targetRoutes = spec.routes;
  if (tag) targetRoutes = targetRoutes.filter((r) => r.tags.includes(tag));
  if (singlePath) targetRoutes = targetRoutes.filter((r) => r.path === singlePath);
  if (targetRoutes.length === 0) {
    console.warn(chalk.yellow("筛选后无匹配接口，终止执行"));
    return;
  }

  const schemaCodeBlock = buildCodeBlock(ctx.db.schemaFileList, ctx.db.schemaSourceTexts);
  const relationCodeBlock = buildCodeBlock(ctx.db.relationFileList, ctx.db.relationSourceTexts);
  const contractCodeBlock = buildCodeBlock(ctx.contract.contractFileList, ctx.contract.sourceTexts);

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

  const templateText = readPromptTemplate(templatePath);
  const finalPrompt = renderPromptTemplate(templateText, vars);
  writeFileSync(outputPromptPath, finalPrompt);

  console.log(boxen(
    [
      format("输出路径: %s", [chalk.underline(outputPromptPath)]),
      format("筛选接口: %s 条", [String(targetRoutes.length)]),
      "",
      chalk.dim("复制 ai-prompt.md 全部内容发送给大模型即可生成全套分层代码"),
    ].join("\n"),
    {
      headerText: "✅ 提示词已生成",
      borderStyle: "round",
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
    },
  ));
}

export default async function makePrompt(args: { tag?: string; path?: string }) {
  await makePromptCommand(args.tag, args.path);
}
