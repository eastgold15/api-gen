import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { readFileSync, writeFileSync } from "@visulima/fs";
import { resolve, join, dirname, basename } from "@visulima/path";
import chalk from "@visulima/colorize";
import { pail } from "@visulima/pail";
import { parseTsFile, traverseAst } from "../utils/ast-scanner.js";
import type { ApiGenRootConfig, AppLayout, AppType } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

interface ControllerFile {
  /** 相对于 modulesDir 的路径,如 "user/user.controller.ts" */
  relativePath: string;
  /** import 路径(无后缀),如 "./user/user.controller" */
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

// ---------------------------------------------------------------------------
// 扫描 modules 目录
// ---------------------------------------------------------------------------

/**
 * 扫描 apps/<app>/src/modules/(b2b-api) 或 src/server/modules/(web)
 * 找到所有 <domain>/<domain>.controller.ts
 *
 * @param modulesDir  modules 根目录绝对路径
 * @param importPrefix  聚合文件相对 modules/<d>/ 的 import 前缀:
 *                      - b2b-api 聚合文件就在 modules/ 同级 → "."
 *                      - web 聚合文件在 src/server/index.ts → "./modules"
 */
function discoverControllers(modulesDir: string, importPrefix: string): ControllerFile[] {
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
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith("_")) continue; // _health / _dev 跳过
      if (!entry.isDirectory()) continue;

      const fullPath = join(dir, entry.name);
      const relPath = relativeDir
        ? `${relativeDir}/${entry.name}`
        : entry.name;

      const ctrlFile = join(fullPath, `${entry.name}.controller.ts`);
      if (!existsSync(ctrlFile)) continue;

      // OXc 解析获取实际 export 变量名
      const exportName = extractExportName(ctrlFile);
      if (!exportName) {
        pail.warn(`跳过(非 Elysia 导出): ${relPath}/${entry.name}.controller.ts`);
        continue;
      }

      if (!isCamelCase(exportName)) {
        pail.warn(
          `变量名 "${exportName}" 不是 camelCase(来自 ${relPath}),建议改为驼峰命名`,
        );
      }

      const importPath = `${importPrefix}/${relPath}/${entry.name}.controller`;
      results.push({ relativePath: `${relPath}/${entry.name}.controller.ts`, importPath, variableName: exportName });
    }
  }

  walk(modulesDir, "");
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
// 生成聚合入口文件
// ---------------------------------------------------------------------------

/**
 * 生成聚合入口文件内容。
 *
 * @param files  controller 列表
 * @param appType  决定函数名(applyAllModules vs applyAllControllers)和 header
 * @param healthController  b2b-api 的 health 单独 export
 */
function generateIndexContent(
  files: ControllerFile[],
  appType: AppType,
  healthController?: string | null,
): string {
  const lines: string[] = [];

  const fnName = appType === "b2b-api" ? "applyAllModules" : "applyAllControllers";
  const headerText = appType === "b2b-api"
    ? "b2b-api modules aggregator"
    : "web controllers aggregator";

  lines.push(`// Auto-generated by \`api-gen link\` — ${headerText}. Do not edit manually.`);
  lines.push("// Run `api-gen link` to refresh.");
  lines.push("import type { Elysia } from \"elysia\";");
  lines.push("");

  // b2b-api:healthController 单独 export(供 server.ts 复用)
  if (appType === "b2b-api" && healthController) {
    lines.push(`export { ${healthController} } from "./health/${healthController.replace(/Controller$/, "").replace(/^./, c => c.toLowerCase())}.controller";`);
    lines.push("");
  }

  for (const f of files) {
    lines.push(`import { ${f.variableName} } from "${f.importPath}";`);
  }
  lines.push("");

  lines.push(`export function ${fnName}(app: Elysia) {`);
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
// 决策表
// ---------------------------------------------------------------------------

interface LinkPlan {
  outputPath: string;
  fnName: "applyAllModules" | "applyAllControllers";
  importPrefix: string;
  skip: boolean;
  skipReason?: string;
}

/** 根据 app.appType 决定 link 输出 */
function planForApp(app: AppLayout): LinkPlan {
  if (!app.modulesDir || !app.aggregateIndex) {
    return {
      outputPath: "",
      fnName: "applyAllControllers",
      importPrefix: "",
      skip: true,
      skipReason: "无 modules 目录(纯前端 app)",
    };
  }

  if (app.appType === "b2b-api") {
    return {
      outputPath: app.aggregateIndex,
      fnName: "applyAllModules",
      importPrefix: ".",
      skip: false,
    };
  }

  if (app.appType === "web") {
    return {
      outputPath: app.aggregateIndex,
      fnName: "applyAllControllers",
      importPrefix: "./modules", // 聚合在 src/server/index.ts,modules 在下一层
      skip: false,
    };
  }

  // b2b-admin / frontend
  return {
    outputPath: "",
    fnName: "applyAllControllers",
    importPrefix: "",
    skip: true,
    skipReason: `appType=${app.appType} 不需要聚合入口`,
  };
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

export async function linkCommand(): Promise<void> {
  if (!existsSync(CONFIG_PATH)) {
    console.error(
      chalk.red("缺少配置文件 .vscode/api-gen.json，请先执行 api-gen info"),
    );
    process.exit(1);
  }

  const raw = readFileSync(CONFIG_PATH, { encoding: "utf-8" });
  const config = JSON.parse(raw) as ApiGenRootConfig;

  if (config.apps.length === 0) {
    pail.warn("未检测到任何 app");
    return;
  }

  let totalGenerated = 0;

  for (const app of config.apps) {
    const plan = planForApp(app);
    if (plan.skip) {
      pail.info(`跳过 (${plan.skipReason}): ${chalk.cyan(app.appName)}`);
      continue;
    }

    const modulesDir = resolve(CWD, app.modulesDir!);
    if (!existsSync(modulesDir)) {
      pail.warn(`modules 目录不存在，跳过：${chalk.dim(modulesDir)}`);
      continue;
    }

    const files = discoverControllers(modulesDir, plan.importPrefix);
    const disambiguated = disambiguateNames(files);

    // b2b-api 时检测 health controller(单独 export,不进 applyAllModules 链)
    let healthName: string | null = null;
    if (app.appType === "b2b-api") {
      const healthCtrl = join(modulesDir, "health", "health.controller.ts");
      if (existsSync(healthCtrl)) {
        const name = extractExportName(healthCtrl);
        if (name) healthName = name;
      }
      if (healthName) {
        // 从应用列表剔除 health,避免 generateIndexContent 重复 import
        for (let i = disambiguated.length - 1; i >= 0; i--) {
          if (disambiguated[i].variableName === healthName) {
            disambiguated.splice(i, 1);
          }
        }
      }
    }

    const content = generateIndexContent(disambiguated, app.appType, healthName);
    const outputPath = resolve(CWD, plan.outputPath);

    if (existsSync(outputPath)) {
      unlinkSync(outputPath);
    }

    writeFileSync(outputPath, content);
    totalGenerated++;

    pail.info(`${app.appName} (${app.appType}) → ${chalk.underline(outputPath)}`);
    if (disambiguated.length > 0) {
      console.log(chalk.green(`  ✓ ${disambiguated.length} 个控制器已链接`));
      for (const f of disambiguated) {
        console.log(chalk.dim(`    ${f.relativePath} → ${f.variableName}`));
      }
    } else {
      pail.warn("  未找到 Elysia 控制器文件，已生成空壳");
    }
  }

  pail.success(`已生成 ${totalGenerated} 个聚合入口文件`);
}

export default async function link(): Promise<void> {
  await linkCommand();
}
