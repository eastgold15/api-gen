import { boxen } from "@visulima/boxen";
import chalk from "@visulima/colorize";
import { ensureDirSync } from "@visulima/fs";
import { pail } from "@visulima/pail";
import { dirname, join, resolve } from "@visulima/path";
import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { detectLayout } from "../structure/detector.js";
import type { ApiGenRootConfig } from "../types/api-gen.json.js";
import { initDefaultPromptTemplate } from "../utils/prompt-render.js";
// ---------------------------------------------------------------------------
// 格式化打印工具函数
// ---------------------------------------------------------------------------

function fmtVal(value: string | null): string {
  return value === null ? chalk.dim("(未检测到)") : chalk.cyan(value);
}

function fmtList(items: string[], maxInline = 8): string {
  if (items.length === 0) return chalk.dim("(无)");
  const head = items.slice(0, maxInline);
  const tail =
    items.length > maxInline
      ? chalk.dim(` … 还有 ${items.length - maxInline} 项`)
      : "";
  return chalk.green(head.join(", ")) + tail;
}

function printLayout(config: ApiGenRootConfig): void {
  pail.info(`\n  ${chalk.bold(config.projectName)}`);
  pail.info(chalk.dim(`  类型: ${config.isMonorepo ? "Monorepo" : "单仓库"}`));
  pail.info(chalk.dim("  ".padEnd(50, "─")));

  // common 公共层
  if (config.common) {
    pail.info(chalk.bold("\n  📦 公共合约层 (common)"));
    const c = config.common;
    const rows: [string, string][] = [
      ["rootDir", fmtVal(c.rootDir)],
      ["schemaFiles", fmtList(c.schemaFiles.map(f => pathRelativeName(f)))],
      ["relationFiles", fmtList(c.relationFiles.map(f => pathRelativeName(f)))],
      ["contractFiles", fmtList(c.contractFiles.map(f => pathRelativeName(f)))],
      ["typeboxDir", fmtVal(c.typeboxDir)],
      ["existingSchemas", fmtList(c.existingSchemas)],
      ["existingContractModules", fmtList(c.existingContractModules)],
    ];
    const labelWidth = Math.max(...rows.map((r) => r[0].length)) + 2;
    for (const [label, value] of rows) {
      pail.info(`    ${chalk.yellow(label.padEnd(labelWidth))} ${value}`);
    }
  }

  // apps 应用列表
  pail.info(chalk.bold(`\n  🚀 应用列表 (${config.apps.length})`));
  for (const app of config.apps) {
    pail.info(`    ${chalk.cyan(app.appName)}`);
    pail.info(`      appRoot:        ${fmtVal(app.appRoot)}`);
    pail.info(`      controllersDir: ${fmtVal(app.controllersDir)}`);
    pail.info(`      serverDir:      ${fmtVal(app.serverDir)}`);
  }

  // AI 配置摘要
  pail.info(chalk.bold("\n  🤖 AI 配置"));
  pail.info(`    provider:  ${chalk.cyan(config.ai.provider)}`);
  pail.info(`    model:     ${chalk.cyan(config.ai.model)}`);
  pail.info(`    baseUrl:   ${fmtVal(config.ai.baseUrl ?? null)}`);

  // structureTree
  if (config.structureTree) {
    pail.info(chalk.bold("\n  🌳 项目结构树"));
    const treeLines = config.structureTree.split("\n").map(l => `    ${l}`).join("\n");
    pail.info(chalk.dim(treeLines));
  }

  pail.info("");
}

function pathRelativeName(absPath: string): string {
  // 取最后两级 path segment 做展示
  const parts = absPath.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}




export async function askConfirm(message: string): Promise<boolean> {
  const im = pail.getInteractiveManager();
  if (im) im.suspend("stdout");

  const { ok } = await inquirer.prompt([
    {
      type: "confirm",
      name: "ok",
      message,
      default: true,
    },
  ]);

  if (im) im.resume("stdout");
  return ok;
}
// async function askConfirm(message: string): Promise<boolean> {
//   // 交互输入这里保留原生 readline，pail 也有交互API可替换，不改也完全没问题
//   processStdout.write(`\n${chalk.cyan("?")} ${message} ${chalk.dim("(确认Y / 取消n)")} `);
//   const rl = createInterface({
//     input: processStdin,
//     output: processStdout,
//   });
//   try {
//     const answer = await rl.question("");
//     const trimmed = answer.trim().toLowerCase();
//     return trimmed === "" || trimmed === "y" || trimmed === "yes";
//   } finally {
//     rl.close();
//   }
// }

// ---------------------------------------------------------------------------
// init 主命令逻辑
// ---------------------------------------------------------------------------

export async function initCommand(directory?: string): Promise<void> {
  const cwd = directory ? resolve(directory) : process.cwd();

  pail.debug(`\n  正在扫描目录：${cwd} …`);

  const config = detectLayout(cwd);

  printLayout(config);

  const confirmed = await askConfirm("是否将检测到的项目结构保存到 .vscode/api-gen.json？");

  if (!confirmed) {
    pail.warn("\n  操作已取消。");
    return;
  }

  const configPath = resolve(cwd, ".vscode/api-gen.json");

  // 合并已有配置，保留用户填写的 AI Key 等自定义字段
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    } catch {
      // 原有文件解析异常则忽略
    }
  }

  const merged = {
    ...existing,
    projectName: config.projectName,
    isMonorepo: config.isMonorepo,
    structureTree: config.structureTree,
    common: config.common,
    apps: config.apps,
    ai: existing.ai ?? config.ai,
  };

  ensureDirSync(dirname(configPath));
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");

  pail.success(`\n  项目配置已保存至 ${configPath}`);

  // 初始化 AI 提示词模板
  const vscodeDir = dirname(configPath);
  const tplPath = join(vscodeDir, "ai-prompt.template.md");
  initDefaultPromptTemplate(tplPath);
  if (existsSync(tplPath)) {
    pail.debug(`  已初始化 AI 提示词模板：${tplPath}`);
  }

  // 组装摘要文本
  const summary: string[] = [];
  if (config.common) {
    summary.push(`公共合约层包含 ${config.common.existingSchemas.length} 张表、${config.common.existingContractModules.length} 个合约`);
  }
  for (const app of config.apps) {
    const parts = [`应用 "${app.appName}"`];
    if (app.controllersDir) parts.push("有控制器");
    if (app.serverDir) parts.push("有服务端");
    summary.push(parts.join("，"));
  }
  summary.push(`AI 驱动：${config.ai.provider} / ${config.ai.model}`);

  const boxText = boxen(summary.map((s) => `· ${s}`).join("\n"), {
    headerText: "检测到项目模块",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderStyle: "round",
  });
  pail.info(boxText);
  pail.info("");
}

export default initCommand;