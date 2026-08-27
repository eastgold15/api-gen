import { boxen } from "@visulima/boxen";
import chalk from "@visulima/colorize";
import { ensureDirSync } from "@visulima/fs";
import { pail } from "@visulima/pail";
import { dirname, join, resolve } from "@visulima/path";
import { createTable } from "@visulima/tabular";
import inquirer from "inquirer";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { detectLayout } from "../structure/detector.js";
import type { ApiGenRootConfig, AppLayout, AppType } from "../types/api-gen.json.js";
import { initDefaultPromptTemplate } from "../utils/prompt-render.js";

// ---------------------------------------------------------------------------
// 格式化打印工具函数
// ---------------------------------------------------------------------------

function fmtVal(value: string | null): string {
  return value === null ? chalk.dim("—") : chalk.cyan(value);
}

function fmtList(items: string[], maxInline = 8): string {
  if (items.length === 0) return chalk.dim("—");
  const head = items.slice(0, maxInline);
  const tail =
    items.length > maxInline
      ? chalk.dim(` … 还有 ${items.length - maxInline} 项`)
      : "";
  return chalk.green(head.join(", ")) + tail;
}

function fmtAppType(type: AppType): string {
  switch (type) {
    case "b2b-api":
      return chalk.green(type);
    case "web":
      return chalk.cyan(type);
    case "b2b-admin":
      return chalk.yellow(type);
    default:
      return chalk.gray(type);
  }
}

function pathRelativeName(absPath: string): string {
  const parts = absPath.replace(/\\/g, "/").split("/");
  return parts.slice(-2).join("/");
}

// ---------------------------------------------------------------------------
// 表格打印函数
// ---------------------------------------------------------------------------

function printLayout(config: ApiGenRootConfig): void {
  // 1. 项目信息表
  const infoTable = createTable();
  infoTable.setHeaders([chalk.bold("属性"), chalk.bold("值")]);
  infoTable.addRow(["项目名称", chalk.bold(config.projectName)]);
  infoTable.addRow(["项目类型", config.isMonorepo ? "Monorepo" : "单仓库"]);
  console.log(infoTable.toString());

  // 2. 公共合约层表
  if (config.common) {
    const c = config.common;
    const commonTable = createTable();
    commonTable.setHeaders([chalk.bold("公共层"), chalk.bold("值")]);
    commonTable.addRow(["rootDir", fmtVal(c.rootDir)]);
    commonTable.addRow(["dbschemaFiles", fmtList(c.dbschemaFiles.map(f => pathRelativeName(f)))]);
    commonTable.addRow(["tbschemaFiles", fmtList(c.tbschemaFiles.map(f => pathRelativeName(f)))]);
    commonTable.addRow(["relationFiles", fmtList(c.relationFiles.map(f => pathRelativeName(f)))]);
    commonTable.addRow(["reposFiles", fmtList(c.reposFiles.map(f => pathRelativeName(f)))]);
    commonTable.addRow(["tbschemaRoot", fmtVal(c.tbschemaRoot)]);
    commonTable.addRow(["tbschemaRawDir", fmtVal(c.tbschemaRawDir)]);
    commonTable.addRow(["existingSchemas", fmtList(c.existingSchemas)]);
    commonTable.addRow(["existingContractModules", fmtList(c.existingContractModules)]);
    console.log(commonTable.toString());
  }

  // 3. 应用列表表
  const appsTable = createTable();
  appsTable.setHeaders([
    chalk.bold("应用"),
    chalk.bold("类型"),
    chalk.bold("modules 目录"),
    chalk.bold("聚合入口"),
  ]);
  for (const app of config.apps) {
    appsTable.addRow([
      chalk.cyan(app.appName),
      fmtAppType(app.appType),
      fmtVal(app.modulesDir),
      fmtVal(app.aggregateIndex),
    ]);
  }
  console.log(appsTable.toString());

  // 4. 结构树
  if (config.structureTree) {
    console.log(chalk.bold("\n  🌳 项目结构树"));
    console.log(chalk.dim(config.structureTree.split("\n").map(l => `    ${l}`).join("\n")));
    console.log();
  }
}

// ---------------------------------------------------------------------------
// 交互确认
// ---------------------------------------------------------------------------

async function askConfirm(message: string): Promise<boolean> {
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

const APP_TYPE_CHOICES: { name: string; value: AppType }[] = [
  { name: "b2b-api  (Elysia 后台 API, modules 在 src/modules/)",        value: "b2b-api" },
  { name: "web      (Next + Elysia 用户站, modules 在 src/server/)",     value: "web" },
  { name: "b2b-admin(Next 后台前端, 无 modules, 只有 hooks/api/)",       value: "b2b-admin" },
  { name: "frontend (其它纯前端, 有 hooks/api 但非 Next 套件)",          value: "frontend" },
];

/** 给每个 app 单独确认 appType,默认值是 detector 探测结果;用户可改 */
async function askAppType(apps: AppLayout[]): Promise<AppLayout[]> {
  const im = pail.getInteractiveManager();
  if (im) im.suspend("stdout");

  try {
    const result: AppLayout[] = [];
    for (const app of apps) {
      const { choice } = await inquirer.prompt([
        {
          type: "select",
          name: "choice",
          message: `App "${chalk.cyan(app.appName)}" 的类型? (detector 探测: ${fmtAppType(app.appType)})`,
          choices: [...APP_TYPE_CHOICES, { name: chalk.dim("— 跳过,丢弃该 app —"), value: "__skip__" }],
          default: app.appType,
        },
      ]);
      if (choice === "__skip__") {
        pail.warn(`  已丢弃 app: ${chalk.dim(app.appName)}`);
        continue;
      }
      result.push({ ...app, appType: choice });
    }
    return result;
  } finally {
    if (im) im.resume("stdout");
  }
}

// ---------------------------------------------------------------------------
// info 主命令逻辑（生成 api-gen.json，给 AI 看的项目结构）
// ---------------------------------------------------------------------------

export async function infoCommand(
  directory?: string,
  options: { yes?: boolean } = {},
): Promise<void> {
  const cwd = directory ? resolve(directory) : process.cwd();
  const autoYes = options.yes === true;

  pail.debug(`\n  正在扫描目录：${cwd} …`);

  const config = detectLayout(cwd);

  printLayout(config);

  // 第一轮:确认是否保存(--yes 跳过 inquirer,直接保存)
  const confirmed = autoYes
    ? true
    : await askConfirm("是否将检测到的项目结构保存到 .vscode/api-gen.json？");

  if (!confirmed) {
    pail.warn("\n  操作已取消。");
    return;
  }

  // 第二轮:逐个 app 确认 appType(--yes 跳过,直接用 detector 默认值)
  const finalApps = autoYes ? config.apps : await askAppType(config.apps);
  if (finalApps.length === 0) {
    pail.warn("\n  所有 app 都被丢弃,操作取消。");
    return;
  }

  const configPath = resolve(cwd, ".vscode/api-gen.json");

  const merged: ApiGenRootConfig = {
    projectName: config.projectName,
    isMonorepo: config.isMonorepo,
    structureTree: config.structureTree,
    common: config.common,
    apps: finalApps,
  };

  ensureDirSync(dirname(configPath));
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");

  pail.success(`\n  项目结构已保存至 ${configPath}`);

  const vscodeDir = dirname(configPath);
  const tplPath = join(vscodeDir, "ai-prompt.template.md");
  initDefaultPromptTemplate(tplPath);
  if (existsSync(tplPath)) {
    pail.debug(`  已初始化 AI 提示词模板：${tplPath}`);
  }

  const summary: string[] = [];
  if (config.common) {
    summary.push(`公共合约层包含 ${config.common.existingSchemas.length} 张表、${config.common.existingContractModules.length} 个合约`);
  }
  for (const app of finalApps) {
    const parts = [`应用 "${app.appName}" (${app.appType})`];
    if (app.modulesDir) parts.push("有 modules");
    if (app.aggregateIndex) parts.push("有聚合入口");
    summary.push(parts.join("，"));
  }

  console.log(boxen(summary.map((s) => `· ${s}`).join("\n"), {
    headerText: "检测到项目模块",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    borderStyle: "round",
  }));
}

export default infoCommand;
