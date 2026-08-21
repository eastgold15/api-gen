import { existsSync, readdirSync } from "node:fs";
import { resolve, join } from "@visulima/path";

// ---------------------------------------------------------------------------
// 共享常量
// ---------------------------------------------------------------------------

/** 桶导出扫描统一黑名单——新增跳过项请改这里,sync / barrel 都引用这一份 */
export const SKIP_DIRS = new Set([
  "node_modules", "dist", ".vscode", ".git", "scripts",
  ".next", ".agengt", ".claude", ".lingma", "turbo",
]);

/** 判断组名是否为路径形式（含 / 或以 . 开头），区别于约定名组（utils/hooks 等） */
export function isPathLike(s: string): boolean {
  return s.includes("/") || s.includes("\\") || s.startsWith(".");
}

// ---------------------------------------------------------------------------
// 路径形式组子项扫描
// ---------------------------------------------------------------------------

export interface ScanPathGroupOpts {
  /**
   * 排除模式列表（不带 `!` 前缀）。匹配规则:
   * - 相对项目根的精确路径(如 `packages/contract/src/drizzle`)
   * - 以模式为前缀的所有子路径(如 `packages/contract/src/drizzle` 也会排除 `drizzle/schemas`)
   * 传 `["drizzle"]` 这种 basename 也支持,匹配所有同名一级子目录
   */
  exclude?: string[];
}

/**
 * 递归扫描路径形式组的子项,返回相对项目根的路径列表(已排序)。
 *
 * 扫描规则:
 * - 任何**有 .ts 内容**(直接或后代里有 .ts 内容)的子目录都会被纳入,递归到底
 * - **散 .ts 文件只在组根那一层**纳入;深层散文件归所属子目录的 barrel 管
 *   (子目录的 index.ts 才会聚它们,组根 index.ts 不应该再越级 import)
 * - SKIP_DIRS 黑名单全程生效(每层都过滤)
 * - `exclude` 模式以"路径前缀"方式匹配,精确或前缀命中都会排除该项及其后代
 * - **组根目录本身不在结果中**(返回的是组根的"子内容",不是组根自身——否则会被
 *   barrel 当作子模块处理,产生自引用)
 *
 * 这样 sync 可以"一次填满整个组",barrel 也可以在没有 sync 先跑的情况下
 * 直接基于组名路径递归展开 included,用户不用维护子项列表。
 */
export function scanPathGroupChildren(
  absPath: string,
  relPath: string,
  opts: ScanPathGroupOpts = {},
): string[] {
  if (!existsSync(absPath)) return [];
  const exclude = opts.exclude ?? [];

  const result: string[] = [];

  /** 递归到子目录,只收集"有内容的子目录"路径,不再带回散文件。
   *  "有内容" = 本层有散 .ts 文件 OR 任何子目录有内容。
   *  返回 hasContent 让调用方决定是否把本层加进 result。 */
  function collectSubDirs(abs: string, rel: string): boolean {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return false;
    }

    let hasContent = false;
    const subDirs: { abs: string; rel: string }[] = [];

    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (e.isDirectory()) {
        subDirs.push({ abs: join(abs, e.name), rel: join(rel, e.name) });
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name === "index.ts") continue;
      if (e.name.endsWith(".d.ts")) continue;
      if (e.name.endsWith(".test.ts")) continue;
      if (!e.name.endsWith(".ts")) continue;
      hasContent = true; // 本层有散 .ts 文件
    }

    for (const sub of subDirs) {
      if (isExcluded(sub.rel, exclude)) continue;
      // 子目录的散文件归子目录 barrel 管,这里只关心"子目录是否有内容"
      if (collectSubDirs(sub.abs, sub.rel)) {
        result.push(sub.rel);
        hasContent = true;
      }
    }

    return hasContent;
  }

  // 组根本身:收集"有内容的子目录"+"组根散文件"
  let rootEntries: import("node:fs").Dirent[];
  try {
    rootEntries = readdirSync(absPath, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const e of rootEntries) {
    if (SKIP_DIRS.has(e.name)) continue;
    if (e.isDirectory()) {
      const subAbs = join(absPath, e.name);
      const subRel = join(relPath, e.name);
      if (isExcluded(subRel, exclude)) continue;
      if (collectSubDirs(subAbs, subRel)) {
        result.push(subRel);
      }
      continue;
    }
    if (!e.isFile()) continue;
    if (e.name === "index.ts") continue;
    if (e.name.endsWith(".d.ts")) continue;
    if (e.name.endsWith(".test.ts")) continue;
    if (!e.name.endsWith(".ts")) continue;
    const looseRel = join(relPath, e.name);
    if (isExcluded(looseRel, exclude)) continue;
    result.push(looseRel);
  }

  return result.sort();
}

/** 路径排除匹配:
 *  - 精确匹配:`patterns` 含 `rel` 本身
 *  - 前缀匹配:`patterns` 含 `rel` 的祖先路径(意味着整个子树被排除)
 *  - basename 匹配:`patterns` 含 `rel` 的最后一段(所有同名目录)
 */
function isExcluded(rel: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  const norm = rel.replace(/\\/g, "/");
  const tail = norm.split("/").pop() ?? "";
  for (const p of patterns) {
    const pn = p.replace(/\\/g, "/");
    if (pn === norm) return true;
    if (norm.startsWith(pn + "/")) return true;
    if (pn === tail) return true;
  }
  return false;
}
