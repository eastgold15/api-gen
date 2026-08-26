import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join, basename, dirname } from "@visulima/path";
import { parseTsFile, traverseAst } from "../utils/ast-scanner.js";
import { buildStructureTree, Layer, SKIP_DIRS } from "../utils/tree-builder.js";
import type { ApiGenRootConfig, AppLayout, AppType, CommonLayout } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

/** 递归获取指定分层全部文件绝对路径 */
function getLayerFilePaths(root: string, layer: Layer): string[] {
  if (!existsSync(root)) return [];
  const res: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(root, entry.name);
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

/** AST 提取 dbschema 内所有表名(变量名以 Table 结尾) */
function extractTableNames(schemaFile: string): string[] {
  if (!existsSync(schemaFile)) return [];
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

/** 探测 modules 目录下是否有 <domain>/<domain>.controller.ts */
function hasDomainController(modulesAbs: string): boolean {
  if (!existsSync(modulesAbs)) return false;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(modulesAbs, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith("_")) continue; // _health / _dev 不算"真模块"
    if (existsSync(join(modulesAbs, entry.name, `${entry.name}.controller.ts`))) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 公共合约层扫描
// ---------------------------------------------------------------------------

/** 扫描公共 packages/contract 层 */
function scanCommonLayer(rootDir: string): CommonLayout | null {
  const contractRoot = resolve(rootDir, "packages/contract");
  if (!existsSync(contractRoot)) return null;

  const dbschemaFiles = getLayerFilePaths(contractRoot, "dbschema");
  const tbschemaFiles = getLayerFilePaths(contractRoot, "tbschema");
  const relationFiles = getLayerFilePaths(contractRoot, "relation");
  const reposFiles = getLayerFilePaths(contractRoot, "repos");

  // tbschemaRoot / tbschemaRawDir:即使目录为空(只有 .gitkeep)也要返回,
  // 让 generate:tbschema 和 raw 知道把文件写到哪里
  let tbschemaRoot: string | null = null;
  let tbschemaRawDir: string | null = null;
  if (tbschemaFiles.length) {
    tbschemaRoot = dirname(tbschemaFiles[0]);
    tbschemaRawDir = join(tbschemaRoot, "raw");
  } else {
    // 没文件 → 直接探测 src/tbschema 目录
    const candidateTbschema = resolve(contractRoot, "src/tbschema");
    if (existsSync(candidateTbschema)) {
      tbschemaRoot = candidateTbschema;
      tbschemaRawDir = join(candidateTbschema, "raw");
    } else {
      const candidateAtRoot = resolve(contractRoot, "tbschema");
      if (existsSync(candidateAtRoot)) {
        tbschemaRoot = candidateAtRoot;
        tbschemaRawDir = join(candidateAtRoot, "raw");
      }
    }
  }

  const allTables: string[] = [];
  for (const sf of dbschemaFiles) allTables.push(...extractTableNames(sf));
  const contractModules = tbschemaFiles
    .map((f) => basename(f, ".tbschema.ts"))
    .sort();

  return {
    rootDir: contractRoot,
    dbschemaFiles,
    tbschemaFiles,
    relationFiles,
    reposFiles,
    tbschemaRoot,
    tbschemaRawDir,
    existingSchemas: allTables,
    existingContractModules: contractModules,
  };
}

// ---------------------------------------------------------------------------
// 单 app 扫描 + AppType 识别
// ---------------------------------------------------------------------------

/**
 * 按目录结构识别 AppType(detector 默认值,用户可在 info 交互覆盖)
 *
 * 决策表见 plan §3。返回值是结构探测结果,不读用户配置。
 */
function probeAppType(
  appRootAbs: string,
  appName: string,
): { appType: AppType; modulesDir: string | null; aggregateIndex: string | null; importAlias: string | null } {
  // 1. b2b-api 候选
  const b2bModules = resolve(appRootAbs, "src/modules");
  const hasB2b = hasDomainController(b2bModules);

  // 2. web 候选
  const webModules = resolve(appRootAbs, "src/server/modules");
  const hasWeb = hasDomainController(webModules);

  // 3. 前端 hooks 探测
  const hasHooksApi = existsSync(resolve(appRootAbs, "src/hooks/api"));

  // b2b-admin 优先按名字判定(它永远不挂 modules)
  if (appName === "b2b-admin") {
    return { appType: "b2b-admin", modulesDir: null, aggregateIndex: null, importAlias: null };
  }

  if (hasB2b) {
    return {
      appType: "b2b-api",
      modulesDir: b2bModules,
      aggregateIndex: join(b2bModules, "index.ts"),
      importAlias: "~/modules",
    };
  }

  if (hasWeb) {
    return {
      appType: "web",
      modulesDir: webModules,
      aggregateIndex: resolve(appRootAbs, "src/server/index.ts"),
      importAlias: "~/modules",
    };
  }

  if (hasHooksApi) {
    return { appType: "frontend", modulesDir: null, aggregateIndex: null, importAlias: null };
  }

  // 都不是:留给上层过滤掉
  return { appType: "frontend", modulesDir: null, aggregateIndex: null, importAlias: null };
}

/** 扫描单个 app 目录(monorepo 模式) */
function scanMonorepoApp(appRootAbs: string): AppLayout | null {
  const appName = basename(appRootAbs);
  const probed = probeAppType(appRootAbs, appName);
  if (!probed.modulesDir && !existsSync(resolve(appRootAbs, "src/hooks/api"))) {
    return null;
  }
  return {
    appName,
    appType: probed.appType,
    appRoot: appRootAbs,
    modulesDir: probed.modulesDir,
    aggregateIndex: probed.aggregateIndex,
    importAlias: probed.importAlias,
    // 旧消费方字段(指向 modulesDir,link 仍用)
    controllersDir: probed.modulesDir,
    serviceDir: null,
  };
}

/** 扫描单仓库项目,生成虚拟 main 应用 */
function scanSingleApp(rootDir: string): AppLayout | null {
  const probed = probeAppType(rootDir, "main");
  return {
    appName: "main",
    appType: probed.appType,
    appRoot: rootDir,
    modulesDir: probed.modulesDir,
    aggregateIndex: probed.aggregateIndex,
    importAlias: probed.importAlias,
    controllersDir: probed.modulesDir,
    serviceDir: null,
  };
}

// ---------------------------------------------------------------------------
// 项目形态判断
// ---------------------------------------------------------------------------

/** 判断是否为 monorepo */
function detectIsMonorepo(rootDir: string): boolean {
  const hasPackages = existsSync(join(rootDir, "packages"));
  const hasApps = existsSync(join(rootDir, "apps"));
  return hasPackages || hasApps;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/** 全局入口,输出 ApiGenRootConfig(给 AI 看的项目结构) */
export function detectLayout(rootDir: string): ApiGenRootConfig {
  // 项目名称
  let projectName = basename(rootDir);
  const pkgJsonPath = resolve(rootDir, "package.json");
  if (existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    if (pkg.name) projectName = pkg.name;
  }

  const isMonorepo = detectIsMonorepo(rootDir);
  const common = scanCommonLayer(rootDir);
  const structureTree = buildStructureTree(rootDir);
  const apps: AppLayout[] = [];

  if (isMonorepo) {
    const appsDir = resolve(rootDir, "apps");
    if (existsSync(appsDir)) {
      const entries = readdirSync(appsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) {
          const appInfo = scanMonorepoApp(resolve(appsDir, entry.name));
          if (appInfo) apps.push(appInfo);
        }
      }
    }
  } else {
    // 单仓库,仅一个 main 应用
    const main = scanSingleApp(rootDir);
    if (main) apps.push(main);
  }

  return {
    projectName,
    isMonorepo,
    structureTree,
    common,
    apps,
  };
}
