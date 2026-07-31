/**
 * api-gen archive
 *
 * 把项目目录打包成 .tar.gz 用于服务器部署。
 * 基于 .gitignore 风格的忽略规则，自动跳过 node_modules / dist / .next 等。
 *
 * 用法:
 *   api-gen archive                  # 打包当前项目根目录
 *   api-gen archive -o ./out         # 指定输出目录
 *   api-gen archive --prefix web     # 文件名前缀（默认 tradeflow）
 *   api-gen archive --dry-run        # 只统计文件数，不实际打包
 */

import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ensureDirSync } from "@visulima/fs";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import { create } from "tar";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface ArchiveOptions {
  /** 项目根目录，默认 process.cwd() */
  cwd?: string;
  /** 输出目录，默认项目根 */
  outputDir?: string;
  /** 文件名前缀，默认 "project" */
  prefix?: string;
  /** 仅统计不写文件 */
  dryRun?: boolean;
  /** 额外的忽略 glob（相对于 cwd） */
  extraIgnores?: string[];
}

// ---------------------------------------------------------------------------
// 忽略规则（默认 + 常见部署无关目录）
// ---------------------------------------------------------------------------

const DEFAULT_IGNORES = [
  // Git
  ".git",
  ".github",
  ".gitignore",
  ".gitattributes",

  // Dependencies
  "node_modules",

  // Build outputs
  "dist",
  "build",
  ".next",
  ".svelte-kit",
  ".output",
  ".turbo",
  "auto-gen",

  // Database
  "*.db",
  "*.sqlite",
  "*.sqlite3",
  "database",
  "db_data",
  "postgres-data",
  "minio",

  // Testing
  "coverage",
  ".nyc_output",
  "*.lcov",

  // Logs
  "*.log",
  "logs",

  // IDE
  ".idea",
  ".vscode",
  "*.swp",
  "*.swo",

  // OS
  ".DS_Store",
  "Thumbs.db",

  // Temp
  "*.tmp",
  "*.temp",
  "*.bak",
  "*.backup",
  "*.old",

  // Deployment
  ".vercel",
  ".changeset",

  // TypeScript
  "*.tsbuildinfo",

  // Executables
  "*.exe",
  "*.bat",

  // Sensitive
  "*.key",
  "*.pem",
  "*.crt",
  "*.cer",
  "*.p12",
  "*.pfx",
  "certificates",
  "ssl",
  "keys",

  // Cache
  ".cache",
  ".parcel-cache",
  ".eslintcache",
  ".stylelintcache",

  // Local config
  "config.local.*",
  "local.json",

  // Archives (避免循环打包)
  "*.tar.gz",
  "*.zip",
  "*.tar",

  // Scripts (服务器不需要)
  "scripts",
] as const;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function getTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function formatSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(2)} ${units[unit]}`;
}

/** 把忽略模式转换为 tar 的 ignore 规则：精确名 + 任意位置匹配 */
function buildIgnoreMatchers(ignores: readonly string[]) {
  const exact = new Set<string>();
  const globs: string[] = [];

  for (const pattern of ignores) {
    if (pattern.includes("*")) {
      globs.push(pattern);
    } else {
      // 目录/文件的精确名
      exact.add(pattern);
    }
  }

  return { exact, globs };
}

function shouldIgnore(
  relPath: string,
  matchers: { exact: Set<string>; globs: string[] }
): boolean {
  // 精确名匹配（任一级目录中）
  const parts = relPath.split(/[\\/]/);
  for (const p of parts) {
    if (matchers.exact.has(p)) return true;
  }
  // glob 简单通配：* → 任意非分隔符
  for (const g of matchers.globs) {
    const regex = new RegExp(
      `^${g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/\\\\]*")}$`
    );
    if (regex.test(relPath) || parts.some((p) => regex.test(p))) {
      return true;
    }
  }
  return false;
}

async function collectFiles(
  cwd: string,
  matchers: { exact: Set<string>; globs: string[] },
  base = ""
): Promise<{ count: number; skipped: number; totalSize: number }> {
  let count = 0;
  let skipped = 0;
  let totalSize = 0;

  const entries = await readdir(join(cwd, base), { withFileTypes: true });
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (shouldIgnore(rel, matchers)) {
      skipped++;
      continue;
    }

    const abs = join(cwd, rel);
    if (entry.isDirectory()) {
      const sub = await collectFiles(cwd, matchers, rel);
      count += sub.count;
      skipped += sub.skipped;
      totalSize += sub.totalSize;
    } else if (entry.isFile()) {
      try {
        const st = statSync(abs);
        totalSize += st.size;
        count++;
      } catch {
        skipped++;
      }
    }
  }
  return { count, skipped, totalSize };
}

// ---------------------------------------------------------------------------
// 主命令
// ---------------------------------------------------------------------------

export async function archiveCommand(options: ArchiveOptions = {}): Promise<void> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const outputDir = resolve(options.outputDir ?? cwd);
  const prefix = options.prefix ?? "project";
  const extraIgnores = options.extraIgnores ?? [];

  if (!existsSync(cwd)) {
    pail.error(`源目录不存在: ${cwd}`);
    process.exit(1);
  }

  const matchers = buildIgnoreMatchers([...DEFAULT_IGNORES, ...extraIgnores]);
  const fileName = `${prefix}-${getTimestamp()}.tar.gz`;
  const outputPath = join(outputDir, fileName);

  console.log(`\n${chalk.bold("📦 TradeFlow 部署归档生成器")}\n`);
  console.log(`  源目录: ${chalk.cyan(cwd)}`);
  console.log(`  输出:   ${chalk.cyan(outputPath)}\n`);

  pail.info("正在扫描文件...");
  const scan = await collectFiles(cwd, matchers);

  console.log(`  包含: ${chalk.green(scan.count)} 个`);
  console.log(`  跳过: ${chalk.gray(scan.skipped)} 个`);
  console.log(`  大小: ${chalk.cyan(formatSize(scan.totalSize))}\n`);

  if (scan.count === 0) {
    pail.error("没有找到可打包的文件");
    process.exit(1);
  }

  if (options.dryRun) {
    pail.warn("[dry-run] 跳过实际打包");
    return;
  }

  ensureDirSync(outputDir);

  const start = Date.now();
  pail.info("正在创建压缩归档...");

  await create(
    {
      gzip: { level: 9 },
      cwd,
      file: outputPath,
      portable: true,
    },
    await (async () => {
      // 收集所有相对路径
      const files: string[] = [];
      async function walk(base: string) {
        const entries = await readdir(join(cwd, base), { withFileTypes: true });
        for (const entry of entries) {
          const rel = base ? `${base}/${entry.name}` : entry.name;
          if (shouldIgnore(rel, matchers)) continue;
          if (entry.isDirectory()) {
            await walk(rel);
          } else {
            files.push(rel);
          }
        }
      }
      await walk("");
      return files;
    })()
  );

  // 统计输出大小
  const finalSize = statSync(outputPath).size;
  const ratio = ((1 - finalSize / scan.totalSize) * 100).toFixed(1);
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);

  console.log(`\n${chalk.bold.green("✅ 压缩完成！")}`);
  console.log(`  文件:   ${chalk.cyan(fileName)}`);
  console.log(`  大小:   ${chalk.cyan(formatSize(finalSize))}（压缩率 ${ratio}%）`);
  console.log(`  耗时:   ${chalk.gray(elapsed + "s")}\n`);
  console.log(`  使用 ${chalk.cyan(`tar -xzf ${fileName}`)} 解压\n`);
}

export default archiveCommand;
