import { existsSync, readdirSync } from "node:fs";
import { readFileSync, writeFileSync, ensureDirSync } from "@visulima/fs";
import { resolve, join, dirname } from "@visulima/path";
import { runPipeline } from "../utils/file-transform.js";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import type { ApiConfig, ExportIndexConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".vscode", ".git", "scripts",
  ".next", ".agengt", ".claude", ".lingma", "turbo",
]);

/** 扫描目标文件夹名 */
const BARREL_TARGETS = new Set([
  "utils", "hooks", "helpers", "constants", "types",
  "schemas", "validators", "middleware",
]);

// ---------------------------------------------------------------------------
// 目录扫描
// ---------------------------------------------------------------------------

/** 判断组名是否为路径形式（含 / 或以 . 开头），区别于约定名组（utils/hooks 等） */
function isPathLike(s: string): boolean {
  return s.includes("/") || s.includes("\\") || s.startsWith(".");
}

/** 扫一个路径形式组：返回它下面的一级子目录 + 散 .ts 文件 */
function scanPathGroup(absPath: string, relPath: string): string[] {
  if (!existsSync(absPath)) return [];
  let entries: import("node:fs").Dirent[];
  try { entries = readdirSync(absPath, { withFileTypes: true }); } catch { return []; }

  const paths: string[] = [];
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.name === "index.ts" || e.name.endsWith(".d.ts") || e.name.endsWith(".test.ts")) continue;
    if (e.isDirectory()) {
      paths.push(join(relPath, e.name));
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      paths.push(join(relPath, e.name));
    }
  }
  return paths.sort();
}

function collectDirs(
  dir: string,
  result: Record<string, string[]>,
  prefix: string,
) {
  if (!existsSync(dir)) return;
  let entries: import("node:fs").Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const fullPath = join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (BARREL_TARGETS.has(entry.name)) {
      if (!result[entry.name]) result[entry.name] = [];
      result[entry.name].push(relPath);
    }

    collectDirs(fullPath, result, relPath);
  }
}

function scanBarrelDirs(rootDir: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  collectDirs(rootDir, result, "");
  return result;
}

// ---------------------------------------------------------------------------
// sync 主命令逻辑（更新 api-config.json 的 exportIndex 路径）
// ---------------------------------------------------------------------------

export async function syncCommand(): Promise<void> {
  const cwd = process.cwd();
  const configPath = resolve(cwd, ".vscode/api-config.json");

  if (!existsSync(configPath)) {
    pail.error(`缺少 ${configPath}，请先执行 api-gen init`);
    return;
  }

  const raw = readFileSync(configPath, { encoding: "utf-8" });
  const config = JSON.parse(raw) as ApiConfig;

  // 执行管道工作流
  if (config.pipelines?.length) {
    pail.info(`发现 ${config.pipelines.length} 条管道，开始执行...`);
    for (let i = 0; i < config.pipelines.length; i++) {
      pail.info(`管道 [${i + 1}/${config.pipelines.length}]`);
      runPipeline(config.pipelines[i]);
    }
  }

  const current = config.exportIndex;
  if (!current?.includes?.length) {
    pail.warn("exportIndex 未配置 includes，请在 api-config.json 中添加后再试");
    return;
  }

  const scanned = scanBarrelDirs(cwd);
  const updated: ExportIndexConfig = { includes: current.includes };

  let changed = false;
  for (const name of current.includes) {
    const existingPaths = current[name];
    if (existingPaths && existingPaths.length > 0) {
      // 过滤掉已不存在的目录
      const validPaths = existingPaths.filter((p) => existsSync(resolve(cwd, p)));
      if (validPaths.length !== existingPaths.length) changed = true;
      updated[name] = validPaths;
      console.log(chalk.dim(`  ${name}: 保留 ${validPaths.length} 个路径${validPaths.length < existingPaths.length ? chalk.yellow(`，移除 ${existingPaths.length - validPaths.length} 个失效路径`) : ""}`));
    } else if (isPathLike(name)) {
      // 路径形式组：组名 = 路径，把组名作为唯一项填入。
      // barrel 处理时以组名作为 rootDir 扫描其下子目录 + 散文件，无需在此处展开。
      const abs = resolve(cwd, name);
      if (existsSync(abs)) {
        const children = scanPathGroup(abs, name);
        updated[name] = [name];
        changed = true;
        console.log(chalk.green(`  ✓ ${name}: 路径有效，将作为根目录处理（${children.length} 个子项）`));
        for (const c of children) {
          console.log(chalk.dim(`    - ${c}`));
        }
      } else {
        updated[name] = [];
        console.log(chalk.yellow(`  - ${name}: 路径不存在 ${name}`));
      }
    } else if (scanned[name]?.length) {
      // 约定名组：空路径 → 用扫描结果填充
      updated[name] = scanned[name];
      changed = true;
      console.log(chalk.green(`  ✓ ${name}: 填充 ${scanned[name].length} 个路径`));
      for (const p of scanned[name]) {
        console.log(chalk.dim(`    - ${p}`));
      }
    } else {
      // 没有扫描到 → 保持空数组
      updated[name] = [];
      console.log(chalk.yellow(`  - ${name}: 扫描未发现，保留空路径`));
    }
  }

  // 补缺：includes 里有但 config 缺 key 且未在上一步处理的
  for (const name of current.includes) {
    if (!(name in updated) && scanned[name]?.length) {
      updated[name] = scanned[name];
      changed = true;
      console.log(chalk.green(`  + ${name}: 新增，填充 ${scanned[name].length} 个路径`));
    } else if (!(name in updated)) {
      updated[name] = [];
    }
  }

  if (!changed) {
    pail.info("exportIndex 路径已是最新，无需更新");
    return;
  }

  config.exportIndex = updated;
  ensureDirSync(dirname(configPath));
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  pail.success(`exportIndex 已更新至 ${configPath}`);
}

export default syncCommand;
