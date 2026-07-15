import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import chalk from "chalk";
import { scanAllControllers, type ControllerSpec, type RouteSpec } from "../scanner/controller.js";
import type { ApiGenRootConfig } from "../types/api-gen.json.js";

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
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as ApiGenRootConfig;
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
  writeFileSync(outputPath, json, "utf-8");
  console.log(chalk.green(`接口规格文件已保存至 ${chalk.underline(outputPath)}`));
  console.log(json);
}

// 默认导出，适配入口文件动态 import 加载
export default async function scan(_path?: string): Promise<void> {
  await scanCommand();
}
