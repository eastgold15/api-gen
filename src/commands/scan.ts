import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import chalk from "chalk";
import { loadLayout } from "../structure/detector.js";
import { scanAllControllers, type ControllerSpec, type RouteSpec } from "../scanner/controller.js";

export interface ApiSpec {
  /** 扫描执行时间 ISO-8601 时间戳 */
  scannedAt: string;
  /** 项目名称，读取自 .vscode/api-gen.json */
  projectName: string;
  /** 原始控制器数据，一个文件对应一条 */
  modules: ControllerSpec[];
  /** 所有控制器扁平化后的全部路由列表 */
  routes: RouteSpec[];
  /** 按标签分组路由，无标签统一归类到 untagged */
  groupedByTag: Record<string, RouteSpec[]>;
  /** 统计汇总信息 */
  summary: {
    totalModules: number;
    totalRoutes: number;
    uniqueTags: string[];
  };
}

/**
 * 将路由数组按标签分组；一条路由多个标签时会同时归入多个分组
 * 无标签路由统一归类到 untagged
 */
function groupRoutesByTag(routes: RouteSpec[]): Record<string, RouteSpec[]> {
  const groups: Record<string, RouteSpec[]> = {};
  for (const route of routes) {
    const tagList = route.tags.length > 0 ? route.tags : ["untagged"];
    for (const tag of tagList) {
      if (!groups[tag]) {
        groups[tag] = [];
      }
      groups[tag].push(route);
    }
  }
  return groups;
}

/**
 * 读取配置文件扫描全部控制器，生成完整接口规格 JSON 文件
 *
 * 执行步骤：
 *  1. 读取当前目录下 .vscode/api-gen.json 配置
 *  2. 从配置中解析控制器目录路径
 *  3. 扫描目录下全部 *.controller.ts 控制器
 *  4. 将所有接口按标签分组
 *  5. 控制台打印可读统计信息
 *  6. 完整数据写入 .vscode/api-spec.json
 *  7. 原始 JSON 输出到标准输出流
 */
export async function scanCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".vscode/api-gen.json");
  const outputPath = resolve(cwd, ".vscode/api-spec.json");

  // 1. 读取项目配置
  let layout;
  try {
    layout = loadLayout(configPath);
  } catch (err) {
    console.error(
      chalk.red("读取 .vscode/api-gen.json 失败，目录："),
      chalk.dim(cwd),
    );
    console.error(chalk.dim("请先执行 api-gen init 初始化项目配置。"));
    throw err;
  }

  // 2. 校验控制器目录是否存在
  if (!layout.controllersDir) {
    console.error(
      chalk.red("配置文件中未检测到 controllersDir 控制器目录字段："),
      chalk.dim(configPath),
    );
    process.exit(1);
  }

  const controllersDir = resolve(cwd, layout.controllersDir);

  // 3. 批量扫描所有控制器文件
  const modules = scanAllControllers(controllersDir);

  // 4. 扁平化所有路由并按标签分组
  const allRoutes = modules.flatMap((m) => m.routes);
  const groupedByTag = groupRoutesByTag(allRoutes);

  const uniqueTags = [...new Set(allRoutes.flatMap((r) => r.tags))].sort();

  // 5. 组装完整接口规格对象
  const spec: ApiSpec = {
    scannedAt: new Date().toISOString(),
    projectName: layout.projectName,
    modules,
    routes: allRoutes,
    groupedByTag,
    summary: {
      totalModules: modules.length,
      totalRoutes: allRoutes.length,
      uniqueTags,
    },
  };

  // 6. 控制台打印统计摘要
  console.log(chalk.cyan(`共扫描到 ${chalk.bold(String(spec.summary.totalModules))} 个控制器，合计 ${chalk.bold(String(spec.summary.totalRoutes))} 条接口路由`));

  if (uniqueTags.length > 0) {
    console.log(chalk.dim(`接口标签：${uniqueTags.join(", ")}`));
  }

  for (const mod of modules) {
    const prefix = mod.prefix ? ` ${chalk.dim(`[路由前缀:${mod.prefix}]`)}` : "";
    console.log(`  ${chalk.yellow(mod.name || "(未命名控制器)")}${prefix} — ${mod.routes.length} 条路由`);
  }

  // 7. 写入本地 JSON 文件
  const json = JSON.stringify(spec, null, 2);
  writeFileSync(outputPath, json, "utf-8");
  console.log(chalk.green(`接口规格文件已保存至 ${chalk.underline(outputPath)}`));

  // 8. 原始 JSON 输出到标准输出（无颜色修饰）
  console.log(json);
}

// 默认导出，适配入口文件动态 import 加载
export default async function scan(_path?: string): Promise<void> {
  await scanCommand();
}