import { resolve } from "@visulima/path";
import { readFileSync, writeFileSync } from "@visulima/fs";
import { existsSync, readdirSync } from "node:fs";
import chalk from "@visulima/colorize";
import { createTable } from "@visulima/tabular";
import { format } from "@visulima/fmt";
import { scanAllControllers, type ControllerSpec, type RouteSpec } from "../scanner/controller.js";
import type { ApiGenRootConfig, AppLayout } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 单个应用的扫描结果 */
export interface AppRouteGroup {
  appName: string;
  appType: string;
  appRoot: string;
  modulesDir: string | null;
  aggregateIndex: string | null;
  controllersDir: string | null;
  serviceDir: string | null;
  controllers: ControllerSpec[];
  routes: RouteSpec[];
  groupedByTag: Record<string, RouteSpec[]>;
}

export interface ProjectContext {
  structureTree: string;
  apps: { appName: string; controllerDir: string | null; serviceDir: string | null }[];
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
  isMonorepo: boolean;
  /** 按应用分组的扫描结果 */
  appGroups: AppRouteGroup[];
  summary: {
    totalApps: number;
    totalModules: number;
    totalRoutes: number;
    uniqueTags: string[];
  };
  projectContext: ProjectContext;
}

// ---------------------------------------------------------------------------
// 读取配置
// ---------------------------------------------------------------------------

function readConfig(configPath: string): ApiGenRootConfig {
  const raw = readFileSync(configPath, { encoding: "utf-8" });
  return JSON.parse(raw) as ApiGenRootConfig;
}

function readFileTexts(absPaths: string[]): string[] {
  return absPaths.map((p) => {
    try {
      return readFileSync(p, { encoding: "utf-8" });
    } catch {
      return "";
    }
  });
}

// ---------------------------------------------------------------------------
// ProjectContext 构建（共享给 make-prompt / generate）
// ---------------------------------------------------------------------------

function buildProjectContext(config: ApiGenRootConfig): ProjectContext {
  const apps = config.apps.map((a: AppLayout) => ({
    appName: a.appName,
    controllerDir: a.controllersDir,
    serviceDir: a.serviceDir,
  }));

  let schemaFileList: string[] = [];
  let relationFileList: string[] = [];
  let contractFileList: string[] = [];
  let tableNames: string[] = [];
  let moduleNames: string[] = [];

  if (config.common) {
    schemaFileList = config.common.dbschemaFiles;
    relationFileList = config.common.relationFiles;
    contractFileList = config.common.tbschemaFiles;
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

// ---------------------------------------------------------------------------
// 按 app 扫描
// ---------------------------------------------------------------------------

function scanApp(config: ApiGenRootConfig, app: AppLayout, cwd: string): AppRouteGroup | null {
  // b2b-api → modulesDir;web → modulesDir(也在 src/server/modules 下);
  // 旧字段 controllersDir 仍保留兼容(直接指向 modulesDir 同义)
  const scanDir = app.modulesDir ?? app.controllersDir;
  if (!scanDir) return null;

  const controllersDir = resolve(cwd, scanDir);
  if (!existsSync(controllersDir)) return null;

  const controllers = scanAllControllers(controllersDir);
  const routes = controllers.flatMap((m) => m.routes);

  const groupedByTag: Record<string, RouteSpec[]> = {};
  for (const route of routes) {
    const tagList = route.tags.length > 0 ? route.tags : ["untagged"];
    for (const tag of tagList) {
      if (!groupedByTag[tag]) groupedByTag[tag] = [];
      groupedByTag[tag].push(route);
    }
  }

  return {
    appName: app.appName,
    appType: app.appType,
    appRoot: app.appRoot,
    modulesDir: app.modulesDir,
    aggregateIndex: app.aggregateIndex,
    controllersDir: app.controllersDir,
    serviceDir: app.serviceDir,
    controllers,
    routes,
    groupedByTag,
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function scanCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".vscode/api-gen.json");

  if (!existsSync(configPath)) {
    console.error(chalk.red("读取 .vscode/api-gen.json 失败，请先执行 api-gen init"));
    process.exit(1);
  }

  const config = readConfig(configPath);

  // 逐个 app 扫描
  const appGroups: AppRouteGroup[] = [];
  for (const app of config.apps) {
    const group = scanApp(config, app, cwd);
    if (group) appGroups.push(group);
  }

  // 汇总统计
  const allRoutes = appGroups.flatMap((g) => g.routes);
  const allControllers = appGroups.flatMap((g) => g.controllers);
  const uniqueTags = [...new Set(allRoutes.flatMap((r) => r.tags))].sort();

  const spec: ApiSpec = {
    scannedAt: new Date().toISOString(),
    projectName: config.projectName,
    isMonorepo: config.isMonorepo,
    appGroups,
    summary: {
      totalApps: appGroups.length,
      totalModules: allControllers.length,
      totalRoutes: allRoutes.length,
      uniqueTags,
    },
    projectContext: buildProjectContext(config),
  };

  // 按 app 分组打印路由表格
  for (const group of appGroups) {
    console.log(chalk.bold(`\n  ── ${group.appName} ──`));
    if (group.controllers.length === 0) {
      console.log(chalk.dim("    无控制器"));
      continue;
    }

    const table = createTable();
    table.setHeaders(["控制器", "前缀", "方法", "路径", "标签"]);
    for (const ctrl of group.controllers) {
      for (const route of ctrl.routes) {
        table.addRow([
          ctrl.name || "(未命名)",
          ctrl.prefix || "-",
          chalk.green(route.method),
          route.path,
          route.tags.join(", ") || "-",
        ]);
      }
    }
    console.log(table.toString());
  }

  // 统计汇总
  const tagText = uniqueTags.length > 0 ? uniqueTags.join(", ") : "无";
  console.log(chalk.cyan(
    format("共扫描 %s 个应用，%s 个控制器，%s 条接口路由", [
      String(spec.summary.totalApps),
      String(spec.summary.totalModules),
      String(spec.summary.totalRoutes),
    ]),
  ));
  console.log(chalk.dim(format("接口标签：%s", [tagText])));

  // 写入文件
  const outputPath = resolve(cwd, ".vscode/api-spec.json");
  writeFileSync(outputPath, JSON.stringify(spec, null, 2));
  console.log(chalk.green(format("接口规格文件已保存至 %s", [chalk.underline(outputPath)])));
}

export default async function scan(): Promise<void> {
  await scanCommand();
}
