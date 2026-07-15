import { resolve } from "@visulima/path";
import { readFileSync, writeFileSync } from "@visulima/fs";
import { existsSync, readdirSync } from "node:fs";
import chalk from "@visulima/colorize";
import { scanAllControllers, type ControllerSpec, type RouteSpec } from "../scanner/controller.js";
import type { ApiGenRootConfig, AppLayout } from "../types/api-gen.json.js";

export interface ProjectContext {
  structureTree: string;
  apps: { appName: string; controllerDir: string | null; serverDir: string | null }[];
  db: {
    tableNames: string[];
    schemaFileList: string[];
    schemaSourceTexts: string[];
    relationFileList: string[];
    relationSourceTexts: string[];
  };
  contract: {
    moduleNames: string[];
    contractFileList: string[];
    sourceTexts: string[];
  };
}

export interface ApiSpec {
  scannedAt: string;
  projectName: string;
  modules: ControllerSpec[];
  routes: RouteSpec[];
  groupedByTag: Record<string, RouteSpec[]>;
  summary: {
    totalModules: number;
    totalRoutes: number;
    uniqueTags: string[];
  };
  projectContext: ProjectContext;
}

function groupRoutesByTag(routes: RouteSpec[]): Record<string, RouteSpec[]> {
  const groups: Record<string, RouteSpec[]> = {};
  for (const route of routes) {
    const tagList = route.tags.length > 0 ? route.tags : ["untagged"];
    for (const tag of tagList) {
      if (!groups[tag]) groups[tag] = [];
      groups[tag].push(route);
    }
  }
  return groups;
}

function readConfig(configPath: string): ApiGenRootConfig {
  const raw = readFileSync(configPath, { encoding: "utf-8" });
  return JSON.parse(raw) as ApiGenRootConfig;
}

/** 读取多个文件的源码文本 */
function readFileTexts(absPaths: string[]): string[] {
  return absPaths.map((p) => {
    try {
      return readFileSync(p, { encoding: "utf-8" });
    } catch {
      return "";
    }
  });
}

function buildProjectContext(config: ApiGenRootConfig): ProjectContext {
  // apps
  const apps = config.apps.map((a: AppLayout) => ({
    appName: a.appName,
    controllerDir: a.controllersDir,
    serverDir: a.serverDir,
  }));

  // db & contract — 从 common 层读取
  let schemaFileList: string[] = [];
  let relationFileList: string[] = [];
  let contractFileList: string[] = [];
  let tableNames: string[] = [];
  let moduleNames: string[] = [];

  if (config.common) {
    schemaFileList = config.common.schemaFiles;
    relationFileList = config.common.relationFiles;
    contractFileList = config.common.contractFiles;
    tableNames = config.common.existingSchemas;
    moduleNames = config.common.existingContractModules;
  }

  return {
    structureTree: config.structureTree,
    apps,
    db: {
      tableNames,
      schemaFileList,
      schemaSourceTexts: readFileTexts(schemaFileList),
      relationFileList,
      relationSourceTexts: readFileTexts(relationFileList),
    },
    contract: {
      moduleNames,
      contractFileList,
      sourceTexts: readFileTexts(contractFileList),
    },
  };
}

export async function scanCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".vscode/api-gen.json");
  const outputPath = resolve(cwd, ".vscode/api-spec.json");

  if (!existsSync(configPath)) {
    console.error(
      chalk.red("读取 .vscode/api-gen.json 失败，目录："),
      chalk.dim(cwd),
    );
    console.error(chalk.dim("请先执行 api-gen init 初始化项目配置。"));
    process.exit(1);
  }

  const config = readConfig(configPath);

  // 遍历所有 app 的 controllersDir
  const allModules: ControllerSpec[] = [];
  for (const app of config.apps) {
    if (!app.controllersDir) continue;
    const controllersDir = resolve(cwd, app.controllersDir);
    if (!existsSync(controllersDir)) {
      console.warn(chalk.yellow(`  控制器目录不存在，跳过：${controllersDir}`));
      continue;
    }
    const modules = scanAllControllers(controllersDir);
    allModules.push(...modules);
  }

  const allRoutes = allModules.flatMap((m) => m.routes);
  const groupedByTag = groupRoutesByTag(allRoutes);
  const uniqueTags = [...new Set(allRoutes.flatMap((r) => r.tags))].sort();

  const spec: ApiSpec = {
    scannedAt: new Date().toISOString(),
    projectName: config.projectName,
    modules: allModules,
    routes: allRoutes,
    groupedByTag,
    summary: {
      totalModules: allModules.length,
      totalRoutes: allRoutes.length,
      uniqueTags,
    },
    projectContext: buildProjectContext(config),
  };

  // 控制台打印统计摘要
  console.log(chalk.cyan(`共扫描到 ${chalk.bold(String(spec.summary.totalModules))} 个控制器，合计 ${chalk.bold(String(spec.summary.totalRoutes))} 条接口路由`));
  if (uniqueTags.length > 0) {
    console.log(chalk.dim(`接口标签：${uniqueTags.join(", ")}`));
  }
  for (const mod of allModules) {
    const prefix = mod.prefix ? ` ${chalk.dim(`[路由前缀:${mod.prefix}]`)}` : "";
    console.log(`  ${chalk.yellow(mod.name || "(未命名控制器)")}${prefix} — ${mod.routes.length} 条路由`);
  }

  // 写入本地 JSON 文件
  const json = JSON.stringify(spec, null, 2);
  writeFileSync(outputPath, json);
  console.log(chalk.green(`接口规格文件已保存至 ${chalk.underline(outputPath)}`));
  console.log(json);
}

export default async function scan(_path?: string): Promise<void> {
  await scanCommand();
}
