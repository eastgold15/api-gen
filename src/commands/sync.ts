import { existsSync, readdirSync } from "node:fs";
import { readFileSync, writeFileSync, ensureDirSync } from "@visulima/fs";
import { resolve, join, dirname, relative } from "@visulima/path";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import type { ApiConfig, ExportIndexConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const CWD = process.cwd();
const CONFIG_PATH = resolve(CWD, ".vscode/api-config.json");

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
  if (!existsSync(CONFIG_PATH)) {
    pail.error(`缺少 ${CONFIG_PATH}，请先执行 api-gen init`);
    return;
  }

  const raw = readFileSync(CONFIG_PATH, { encoding: "utf-8" });
  const config = JSON.parse(raw) as ApiConfig;

  const current = config.exportIndex;
  if (!current?.includes?.length) {
    pail.warn("exportIndex 未配置 includes，请在 api-config.json 中添加后再试");
    return;
  }

  const scanned = scanBarrelDirs(CWD);
  const updated: ExportIndexConfig = { includes: current.includes };

  let changed = false;
  for (const name of current.includes) {
    const existingPaths = current[name];
    if (existingPaths && existingPaths.length > 0) {
      // 已有路径 → 保留不动
      updated[name] = existingPaths;
      console.log(chalk.dim(`  ${name}: 保留 ${existingPaths.length} 个路径`));
    } else if (scanned[name]?.length) {
      // 空路径 → 用扫描结果填充
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
    } else if (!(name in current)) {
      updated[name] = [];
    }
  }

  if (!changed) {
    pail.info("exportIndex 路径已是最新，无需更新");
    return;
  }

  config.exportIndex = updated;
  ensureDirSync(dirname(CONFIG_PATH));
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

  pail.success(`exportIndex 已更新至 ${CONFIG_PATH}`);
}

export default syncCommand;
