import { existsSync } from "node:fs";
import { parseTsFile, traverseAst } from "./ast-scanner.js";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface DrizzleTableInfo {
  /** 导出变量名,如 "adTable" */
  varName: string;
  /** Pascal 短名,如 "Ad" */
  pascalName: string;
  /** kebab-case 文件名,如 "ad" */
  fileName: string;
  /**
   * 已解析的列名(camelCase 属性名,跟 Drizzle 里的属性名一致)。
   *
   * 解析时会展开同文件里的列组常量(如 `...Audit` / `...siteScopedCols`),
   * 展开不了的(函数调用等)不计入 —— 生成器只用它做**交集**,
   * 保证 `.omit({...})` 不会因为 key 不存在而在模块加载时炸掉。
   */
  columns: string[];
}

// ---------------------------------------------------------------------------
// 命名转换
// ---------------------------------------------------------------------------

export function camelToKebab(name: string): string {
  const base = name.endsWith("Table") ? name.slice(0, -5) : name;
  return base
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

export function camelToPascal(name: string): string {
  const base = name.endsWith("Table") ? name.slice(0, -5) : name;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// ---------------------------------------------------------------------------
// AST 辅助
// ---------------------------------------------------------------------------

/**
 * OXc 判断是否为建表调用。
 * 支持三种写法:
 * - `pgTable(...)` / `p.pgTable(...)`  —— drizzle 旧 API
 * - `snakeCase.table(...)`             —— drizzle 1.0 的命名空间建表 API
 */
export function isPgTableCall(node: any): boolean {
  if (node?.type !== "CallExpression") return false;
  const callee = node.callee;
  if (callee?.type === "Identifier" && callee.name === "pgTable") return true;
  if (
    callee?.type === "MemberExpression" &&
    callee?.property?.type === "Identifier" &&
    (callee.property.name === "pgTable" || callee.property.name === "table")
  ) return true;
  return false;
}

/** 取对象字面量的属性名(支持 shorthand / 字符串键) */
function propertyName(prop: any): string | null {
  if (!prop || prop.type !== "Property") return null;
  if (prop.key?.type === "Identifier") return prop.key.name;
  if (prop.key?.type === "StringLiteral") return prop.key.value;
  return null;
}

// ---------------------------------------------------------------------------
// 列组常量解析
// ---------------------------------------------------------------------------

/**
 * 收集文件顶层的对象字面量常量(如 `const Audit = { createdAt, id, updatedAt }`),
 * 供建表列展开 spread 时查找。
 */
function collectColumnGroups(program: any): Map<string, any> {
  const groups = new Map<string, any>();
  traverseAst(program, (node) => {
    if (node.type !== "VariableDeclaration") return;
    for (const decl of node.declarations) {
      if (decl.id?.type !== "Identifier") continue;
      if (decl.init?.type !== "ObjectExpression") continue;
      groups.set(decl.id.name, decl.init);
    }
  });
  return groups;
}

/**
 * 展开对象字面量里的 spread,收集所有属性名。
 *
 * @param objNode      对象字面量
 * @param groups       文件顶层的列组常量
 * @param visited      展开过程中的常量名(防循环引用)
 */
function collectColumnNames(
  objNode: any,
  groups: Map<string, any>,
  visited: Set<string> = new Set(),
): string[] {
  const names: string[] = [];
  if (!objNode || objNode.type !== "ObjectExpression") return names;

  for (const prop of objNode.properties) {
    if (prop.type === "SpreadElement") {
      const arg = prop.argument;
      if (arg?.type === "Identifier" && groups.has(arg.name) && !visited.has(arg.name)) {
        visited.add(arg.name);
        names.push(...collectColumnNames(groups.get(arg.name), groups, visited));
      }
      // 展开不了的 spread(函数调用等)跳过 —— 只做交集,不会误 omit
      continue;
    }
    const name = propertyName(prop);
    if (name) names.push(name);
  }
  return names;
}

/** 取建表调用的列对象(第二个参数;少数写法第一个参数就是列对象) */
function pickColumnsObject(callArgs: any[]): any | null {
  for (const arg of callArgs) {
    if (arg?.type === "ObjectExpression") return arg;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 主入口
// ---------------------------------------------------------------------------

/** 从单个 dbschema 文件提取所有 pgTable(含已解析的列名) */
export function extractDrizzleTables(schemaFile: string): DrizzleTableInfo[] {
  if (!existsSync(schemaFile)) return [];
  const { program } = parseTsFile(schemaFile);
  const groups = collectColumnGroups(program);
  const tables: DrizzleTableInfo[] = [];

  traverseAst(program, (node) => {
    if (node.type !== "ExportNamedDeclaration") return;
    if (node.declaration?.type !== "VariableDeclaration") return;
    for (const decl of node.declaration.declarations) {
      if (!isPgTableCall(decl.init)) continue;
      if (decl.id?.type !== "Identifier") continue;
      const varName = decl.id.name;
      const columnsObj = pickColumnsObject(decl.init.arguments ?? []);
      tables.push({
        varName,
        pascalName: camelToPascal(varName),
        fileName: camelToKebab(varName),
        columns: collectColumnNames(columnsObj, groups),
      });
    }
  });

  return tables;
}
