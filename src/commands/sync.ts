import { existsSync, readdirSync } from "node:fs";
import { readFileSync, writeFileSync, ensureDirSync } from "@visulima/fs";
import { resolve, join, dirname } from "@visulima/path";
import { runPipeline } from "../utils/file-transform.js";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import { isPathLike, scanPathGroupChildren, SKIP_DIRS } from "../utils/export-index.js";
import type { ApiConfig, ExportIndexConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

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
      // 保留全部 `!` 排除项原样不动,只对非 `!` 项做存在性校验;
      // 路径形式组的子项可能是深层子目录,barrel 会按 included 列表顺序处理。
      const validPaths = existingPaths.filter((p) =>
        p.startsWith("!") || existsSync(resolve(cwd, p)),
      );
      if (validPaths.length !== existingPaths.length) changed = true;
      updated[name] = validPaths;
      console.log(chalk.dim(`  ${name}: 保留 ${validPaths.length} 个路径${validPaths.length < existingPaths.length ? chalk.yellow(`，移除 ${existingPaths.length - validPaths.length} 个失效路径`) : ""}`));
    } else if (isPathLike(name)) {
      // 路径形式组：组名 = 路径，sync 递归填组名下所有有内容的子目录 + 散 .ts 文件。
      // barrel 接到列表后自识别每项是文件还是目录，统一汇总到组级 index.ts。
      const abs = resolve(cwd, name);
      if (existsSync(abs)) {
        const children = scanPathGroupChildren(abs, name);
        updated[name] = children;
        changed = true;
        console.log(chalk.green(`  ✓ ${name}: 填充 ${children.length} 个子项（递归）`));
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
