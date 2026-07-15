import fs from "node:fs";
import path from "node:path";
import { parseTsFile, traverseAst } from "../utils/ast-scanner.js";
import { buildStructureTree } from "../utils/tree-builder.js";
import type { ApiGenRootConfig, AppLayout, CommonLayout } from "../types/api-gen.json.js";

const SKIP_DIRS = new Set(["node_modules", "dist", ".vscode", ".git", "scripts"]);
type Layer = "controller" | "server" | "schema" | "relation" | "contract";

/** 递归获取指定分层全部文件绝对路径 */
function getLayerFilePaths(root: string, layer: Layer): string[] {
  const res: string[] = [];
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.resolve(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      res.push(...getLayerFilePaths(full, layer));
    }
    if (entry.isFile() && entry.name.endsWith(`.${layer}.ts`)) {
      res.push(full);
    }
  }
  return res;
}

/** AST提取schema内所有表名 */
function extractTableNames(schemaFile: string): string[] {
  if (!fs.existsSync(schemaFile)) return [];
  const { program } = parseTsFile(schemaFile);
  const tables: string[] = [];
  traverseAst(program, (node) => {
    if (node.type === "VariableDeclaration" && !node.declare) {
      for (const decl of node.declarations) {
        const id = decl.id;
        if (id.type === "Identifier" && id.name.endsWith("Table")) {
          tables.push(id.name);
        }
      }
    }
  });
  return tables;
}

/** 扫描公共packages/contract层 */
function scanCommonLayer(rootDir: string): CommonLayout | null {
  const contractRoot = path.resolve(rootDir, "packages/contract");
  if (!fs.existsSync(contractRoot)) return null;

  const schemaFiles = getLayerFilePaths(contractRoot, "schema");
  const relationFiles = getLayerFilePaths(contractRoot, "relation");
  const contractFiles = getLayerFilePaths(contractRoot, "contract");

  const typeboxDir = contractFiles.length ? path.dirname(contractFiles[0]) : null;
  const allTables: string[] = [];
  for (const sf of schemaFiles) allTables.push(...extractTableNames(sf));
  const contractModules = contractFiles.map((f) => path.basename(f, ".contract.ts")).sort();

  return {
    rootDir: contractRoot,
    schemaFiles,
    relationFiles,
    contractFiles,
    typeboxDir,
    existingSchemas: allTables,
    existingContractModules: contractModules,
  };
}

/** 扫描单个app目录，提取controller、server目录 */
function scanSingleApp(appRootAbs: string): AppLayout {
  const appName = path.basename(appRootAbs);
  const srcRoot = path.resolve(appRootAbs, "src");
  const ctrlFiles = getLayerFilePaths(srcRoot, "controller");
  const serverFiles = getLayerFilePaths(srcRoot, "server");

  let controllersDir: string | null = null;
  if (ctrlFiles.length > 0) controllersDir = path.dirname(ctrlFiles[0]);
  let serverDir: string | null = null;
  if (serverFiles.length > 0) serverDir = path.dirname(serverFiles[0]);

  return {
    appName,
    appRoot: srcRoot,
    controllersDir,
    serverDir,
  };
}

/** 扫描单体项目（无apps/packages）生成虚拟main应用 */
function scanSingleAppMode(rootDir: string): AppLayout {
  const srcRoot = path.resolve(rootDir, "src");
  const ctrlFiles = getLayerFilePaths(srcRoot, "controller");
  const serverFiles = getLayerFilePaths(srcRoot, "server");

  let controllersDir: string | null = null;
  if (ctrlFiles.length > 0) controllersDir = path.dirname(ctrlFiles[0]);
  let serverDir: string | null = null;
  if (serverFiles.length > 0) serverDir = path.dirname(serverFiles[0]);

  return {
    appName: "main",
    appRoot: srcRoot,
    controllersDir,
    serverDir,
  };
}

/** 判断是否为monorepo */
function detectIsMonorepo(rootDir: string): boolean {
  const hasPackages = fs.existsSync(path.join(rootDir, "packages"));
  const hasApps = fs.existsSync(path.join(rootDir, "apps"));
  return hasPackages || hasApps;
}

/** 全局入口，输出完整 ApiGenRootConfig */
export function detectLayout(rootDir: string): ApiGenRootConfig {
  // 项目名称
  let projectName = path.basename(rootDir);
  const pkgJsonPath = path.resolve(rootDir, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    if (pkg.name) projectName = pkg.name;
  }

  const isMonorepo = detectIsMonorepo(rootDir);
  const common = scanCommonLayer(rootDir);
  const structureTree = buildStructureTree(rootDir);
  const apps: AppLayout[] = [];

  if (isMonorepo) {
    const appsDir = path.resolve(rootDir, "apps");
    if (fs.existsSync(appsDir)) {
      const entries = fs.readdirSync(appsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
          const appInfo = scanSingleApp(path.resolve(appsDir, entry.name));
          if (appInfo.controllersDir || appInfo.serverDir) apps.push(appInfo);
        }
      }
    }
  } else {
    // 单仓库，仅一个main应用
    apps.push(scanSingleAppMode(rootDir));
  }

  return {
    projectName,
    isMonorepo,
    structureTree,
    common,
    apps,
    ai: {
      provider: "deepseek",
      model: "deepseek-chat",
      apiKey: "请替换为你的API密钥",
      baseUrl: "https://api.deepseek.com",
    },
  };
}