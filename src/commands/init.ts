import { resolve, dirname } from "node:path";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import chalk from "chalk";
import { detectLayout } from "../structure/detector.js";
import type { ApiGenRootConfig, AppLayout, CommonLayout } from "../types/api-gen.json.js";

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
  console.log(chalk.bold(`\n  ${config.projectName}`));
  console.log(chalk.dim(`  类型: ${config.isMonorepo ? "Monorepo" : "单仓库"}`));
  console.log(chalk.dim("  ".padEnd(50, "─")));

  // common 公共层
  if (config.common) {
    console.log(chalk.bold("\n  📦 公共合约层 (common)"));
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
      console.log(`    ${chalk.yellow(label.padEnd(labelWidth))} ${value}`);
    }
  }

  // apps 应用列表
  console.log(chalk.bold(`\n  🚀 应用列表 (${config.apps.length})`));
  for (const app of config.apps) {
    console.log(`    ${chalk.cyan(app.appName)}`);
    console.log(`      appRoot:        ${fmtVal(app.appRoot)}`);
    console.log(`      controllersDir: ${fmtVal(app.controllersDir)}`);
    console.log(`      serverDir:      ${fmtVal(app.serverDir)}`);
  }

  // AI 配置摘要
  console.log(chalk.bold("\n  🤖 AI 配置"));
  console.log(`    provider:  ${chalk.cyan(config.ai.provider)}`);
  console.log(`    model:     ${chalk.cyan(config.ai.model)}`);
  console.log(`    baseUrl:   ${fmtVal(config.ai.baseUrl ?? null)}`);

  // structureTree
  if (config.structureTree) {
    console.log(chalk.bold("\n  🌳 项目结构树"));
    console.log(chalk.dim(config.structureTree.split("\n").map(l => `    ${l}`).join("\n")));
  }

  console.log();
}

function pathRelativeName(absPath: string): string {
  // 取最后两级 path segment 做展示
  const parts = absPath.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}

async function askConfirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: processStdin,
    output: processStdout,
  });
  try {
    const answer = await rl.question(
      `\n${chalk.cyan("?")} ${message} ${chalk.dim("(确认Y / 取消n)")} `,
    );
    const trimmed = answer.trim().toLowerCase();
    return trimmed === "" || trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

// ---------------------------------------------------------------------------
// init 主命令逻辑
// ---------------------------------------------------------------------------

export async function initCommand(directory?: string): Promise<void> {
  const cwd = directory ? resolve(directory) : process.cwd();

  console.log(chalk.dim(`\n  正在扫描目录：${cwd} …\n`));

  const config = detectLayout(cwd);

  printLayout(config);

  const confirmed = await askConfirm("是否将检测到的项目结构保存到 .vscode/api-gen.json？");

  if (!confirmed) {
    console.log(chalk.yellow("\n  操作已取消。\n"));
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

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");

  console.log(chalk.green(`\n  项目配置已保存至 ${configPath}\n`));

  // 打印摘要
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

  console.log(chalk.dim("  本次检测到项目模块："));
  for (const item of summary) {
    console.log(chalk.dim(`    · ${item}`));
  }

  console.log();
}

export default initCommand;
