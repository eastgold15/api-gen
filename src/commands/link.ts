import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { readFileSync, writeFileSync } from "@visulima/fs";
import { resolve, join, dirname, basename } from "@visulima/path";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import { parseTsFile, traverseAst } from "../utils/ast-scanner.js";
import type { ApiGenRootConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface ControllerFile {
  /** 相对于 controllersDir 的路径，如 "user.controller.ts" */
  relativePath: string;
  /** import 路径（无后缀），如 "./user.controller" */
  importPath: string;
  /** 从源码提取的实际 export 变量名 */
  variableName: string;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const CWD = process.cwd();
const CONFIG_PATH = resolve(CWD, ".vscode/api-gen.json");

const SKIP_DIRS = new Set([
  "node_modules", "dist", ".vscode", ".git", "scripts",
  ".next", ".agengt", ".claude", ".lingma", "turbo",
]);

// ---------------------------------------------------------------------------
// AST 提取 export 变量名
// ---------------------------------------------------------------------------

/**
 * 用 OXc 解析 controller 文件，提取 export const xxx = new Elysia(...) 的变量名
 * 返回 null 表示未找到合法 Elysia 导出
 */
/** 递归检查表达式中是否包含 new Elysia(...) */
function isElysiaExpression(node: any): boolean {
  if (!node) return false;
  if (
    node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "Elysia"
  ) return true;
  // new Elysia(...).get(...).post(...) 链式调用
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    return isElysiaExpression(node.callee.object);
  }
  return false;
}

function extractExportName(filePath: string): string | null {
  try {
    const { program } = parseTsFile(filePath);
    let found: string | null = null;

    traverseAst(program, (node) => {
      if (found) return;

      if (
        node.type === "ExportNamedDeclaration" &&
        node.declaration?.type === "VariableDeclaration" &&
        node.declaration.declarations?.length > 0
      ) {
        const d = node.declaration.declarations[0];
        if (isElysiaExpression(d.init) && d.id?.type === "Identifier") {
          found = d.id.name;
        }
      }
    });

    return found;
  } catch {
    return null;
  }
}

/** 校验 camelCase */
function isCamelCase(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

/** kebab-case → camelCase（降级用） */
function kebabToCamel(name: string): string {
  return name
    .split("-")
    .map((s, i) =>
      i === 0
        ? s.toLowerCase()
        : s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// 扫描 controllers 目录
// ---------------------------------------------------------------------------

function discoverControllers(controllersDir: string): ControllerFile[] {
  const results: ControllerFile[] = [];

  function walk(dir: string, relativeDir: string) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(fullPath, relPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".controller.ts") &&
        !entry.name.endsWith(".d.ts")
      ) {
        // OXc 解析获取实际 export 变量名
        const exportName = extractExportName(fullPath);

        if (!exportName) {
          pail.warn(`跳过（非 Elysia 导出）：${relPath}`);
          continue;
        }

        // 校验 camelCase
        if (!isCamelCase(exportName)) {
          pail.warn(
            `变量名 "${exportName}" 不是 camelCase（来自 ${relPath}），建议改为驼峰命名`,
          );
        }

        const importPath = `./${relPath.replace(/\.ts$/, "")}`;
        results.push({ relativePath: relPath, importPath, variableName: exportName });
      }
    }
  }

  walk(controllersDir, "");
  return results;
}

/** 处理重名变量 */
function disambiguateNames(files: ControllerFile[]): ControllerFile[] {
  const groups = new Map<string, ControllerFile[]>();

  for (const file of files) {
    const group = groups.get(file.variableName) || [];
    group.push(file);
    groups.set(file.variableName, group);
  }

  const result: ControllerFile[] = [];

  for (const [name, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      for (const file of group) {
        const parent = dirname(file.relativePath);
        if (parent && parent !== ".") {
          const prefix = parent.replace(/[/\\]/g, "_");
          result.push({ ...file, variableName: `${prefix}_${name}` });
        } else {
          result.push(file);
        }
      }
    }
  }

  return result.sort((a, b) => a.variableName.localeCompare(b.variableName));
}

// ---------------------------------------------------------------------------
// 生成 index.ts
// ---------------------------------------------------------------------------

function generateIndexContent(files: ControllerFile[]): string {
  const lines: string[] = [];

  lines.push("// Auto-generated — do not edit manually.");
  lines.push("// Run `api-gen link` to refresh.");
  lines.push("import type { Elysia } from \"elysia\";");
  lines.push("");

  for (const f of files) {
    lines.push(`import { ${f.variableName} } from "${f.importPath}";`);
  }
  lines.push("");

  lines.push("export function applyAllControllers(app: Elysia) {");
  if (files.length === 0) {
    lines.push("  return app;");
  } else {
    lines.push("  return app");
    for (let i = 0; i < files.length; i++) {
      const sep = i < files.length - 1 ? "" : ";";
      lines.push(`    .use(${files[i].variableName})${sep}`);
    }
  }
  lines.push("}");
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function linkCommand(): Promise<void> {
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      chalk.red("缺少配置文件 .vscode/api-gen.json，请先执行 api-gen init"),
    );
    process.exit(1);
  }

  const raw = readFileSync(CONFIG_PATH, { encoding: "utf-8" });
  const config = JSON.parse(raw) as ApiGenRootConfig;

  const appsWithControllers = config.apps.filter((a) => a.controllersDir);

  if (appsWithControllers.length === 0) {
    pail.warn("未找到配置了控制器目录的应用");
    return;
  }

  let totalGenerated = 0;

  for (const app of appsWithControllers) {
    const dir = resolve(CWD, app.controllersDir!);

    if (!existsSync(dir)) {
      pail.warn(`控制器目录不存在，跳过：${chalk.dim(dir)}`);
      continue;
    }

    const files = discoverControllers(dir);
    const disambiguated = disambiguateNames(files);
    const content = generateIndexContent(disambiguated);
    const outputPath = join(dir, "index.ts");

    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }

    writeFileSync(outputPath, content);
    totalGenerated++;

    pail.info(`${app.appName}: ${chalk.underline(outputPath)}`);
    if (disambiguated.length > 0) {
      console.log(chalk.green(`  ✓ ${disambiguated.length} 个控制器已链接`));
      for (const f of disambiguated) {
        console.log(chalk.dim(`    ${f.relativePath} → ${f.variableName}`));
      }
    } else {
      pail.warn("  未找到 Elysia 控制器文件，已生成空壳");
    }
  }

  pail.success(`已生成 ${totalGenerated} 个 index.ts`);
}

export default async function link(): Promise<void> {
  await linkCommand();
}
