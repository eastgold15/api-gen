import { resolve, dirname } from "node:path";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as processStdin, stdout as processStdout } from "node:process";
import chalk from "chalk";
import { detectLayout } from "../structure/detector.js";
import type { ProjectLayout } from "../structure/detector.js";

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

function printLayout(layout: ProjectLayout): void {
  const rows: [string, string][] = [
    ["项目名称", chalk.bold(layout.projectName)],
    ["合约公共目录", fmtVal(layout.contractDir)],
    ["数据表定义文件", fmtVal(layout.schemaPath)],
    ["表关联关系文件", fmtVal(layout.relationPath)],
    ["TypeBox 合约目录", fmtVal(layout.typeboxDir)],
    ["控制器路由目录", fmtVal(layout.controllersDir)],
    ["服务源码根目录", fmtVal(layout.serverDir)],
    [
      `数据表定义(${layout.existingSchemas.length})`,
      fmtList(layout.existingSchemas),
    ],
    [
      `接口合约(${layout.existingContracts.length})`,
      fmtList(layout.existingContracts),
    ],
  ];

  const labelWidth = Math.max(...rows.map((r) => r[0].length)) + 2;

  console.log(chalk.bold("\n  项目目录结构检测结果"));
  console.log(chalk.dim("  ".padEnd(50, "─")));
  console.log();

  for (const [label, value] of rows) {
    console.log(`  ${chalk.yellow(label.padEnd(labelWidth))} ${value}`);
  }

  console.log();
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

  const layout = detectLayout(cwd);

  printLayout(layout);

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
      // 原有文件解析异常则忽略，直接覆盖基础结构
    }
  }

  const config = {
    ...existing,
    projectName: layout.projectName,
    contractDir: layout.contractDir,
    schemaPath: layout.schemaPath,
    relationPath: layout.relationPath,
    typeboxDir: layout.typeboxDir,
    controllersDir: layout.controllersDir,
    serverDir: layout.serverDir,
    existingSchemas: layout.existingSchemas,
    existingContracts: layout.existingContracts,
    ai: existing.ai ?? {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "请替换为你的API密钥",
      baseUrl: "https://api.deepseek.com",
    },
  };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  console.log(chalk.green(`\n  项目配置已保存至 ${configPath}\n`));

  const summary: string[] = [];
  if (layout.contractDir) {
    summary.push(`公共合约根目录：${layout.contractDir}`);
  }
  if (layout.schemaPath) {
    summary.push(
      `数据表文件，包含 ${layout.existingSchemas.length} 张数据表`,
    );
  }
  if (layout.typeboxDir) {
    summary.push(
      `TypeBox 合约目录，共 ${layout.existingContracts.length} 个接口合约`,
    );
  }
  if (layout.controllersDir) {
    summary.push(`控制器路由目录：${layout.controllersDir}`);
  }
  if (layout.serverDir) {
    summary.push(`服务源码根目录：${layout.serverDir}`);
  }

  console.log(chalk.dim("  本次检测到项目模块："));
  for (const item of summary) {
    console.log(chalk.dim(`    · ${item}`));
  }

  console.log();
}

// 默认导出，适配入口动态导入
export default initCommand;