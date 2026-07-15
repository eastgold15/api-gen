import { parseTsFile, traverseAst, getStringValue, getObjectProperty } from "../utils/ast-scanner.js";
import { readdirSync, existsSync } from "node:fs";
import { resolve, join } from "@visulima/path";

export interface RouteSpec {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  permissions: string[];
}

export interface ControllerSpec {
  name: string;
  prefix: string;
  routes: RouteSpec[];
}

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/** 钻过链式调用，找到底层的 new Elysia(...) 节点 */
function findNewElysia(node: any): any | null {
  if (!node) return null;
  if (
    node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "Elysia"
  ) return node;
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    return findNewElysia(node.callee.object);
  }
  return null;
}

export function scanController(filePath: string): ControllerSpec {
  const absPath = resolve(filePath);
  const { program } = parseTsFile(absPath);

  let controllerName = "";
  let prefix = "";
  const routes: RouteSpec[] = [];

  traverseAst(program, (node) => {
    // 匹配 new Elysia({ prefix: "" }) 及链式调用
    if (node.type === "VariableDeclaration" && !node.declare) {
      for (const decl of node.declarations) {
        const elysiaNode = findNewElysia(decl.init);
        if (!elysiaNode) continue;
        if (decl.id?.type === "Identifier") controllerName = decl.id.name;
        const args = elysiaNode.arguments;
        if (args[0]?.type === "ObjectExpression") {
          const prefixNode = getObjectProperty(args[0], "prefix");
          if (prefixNode) {
            const val = getStringValue(prefixNode);
            if (val) prefix = val;
          }
        }
      }
    }

    // 匹配 .get() / .post() 路由调用
    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee.type !== "MemberExpression") return;
      const prop = callee.property;
      if (prop.type !== "Identifier") return;
      const method = prop.name.toLowerCase();
      if (!HTTP_METHODS.has(method)) return;

      const args = node.arguments;
      const pathStr = getStringValue(args[0]);
      if (!pathStr) return;

      let summary = "";
      let description = "";
      const tags: string[] = [];
      const permissions: string[] = [];

      // 第三个参数是路由配置对象 { detail, allPermissions }
      if (args.length >= 3 && args[2].type === "ObjectExpression") {
        const configObj = args[2];
        const detailObj = getObjectProperty(configObj, "detail");
        if (detailObj?.type === "ObjectExpression") {
          const sNode = getObjectProperty(detailObj, "summary");
          const dNode = getObjectProperty(detailObj, "description");
          const tNode = getObjectProperty(detailObj, "tags");
          if (sNode) summary = getStringValue(sNode) || "";
          if (dNode) description = getStringValue(dNode) || "";
          if (tNode?.type === "ArrayExpression") {
            tNode.elements.forEach((el: any) => {
              const t = getStringValue(el);
              if (t) tags.push(t);
            });
          }
        }
        const permArr = getObjectProperty(configObj, "allPermissions");
        if (permArr?.type === "ArrayExpression") {
          permArr.elements.forEach((el: any) => {
            const p = getStringValue(el);
            if (p) permissions.push(p);
          });
        }
      }

      routes.push({
        method: method.toUpperCase(),
        path: pathStr,
        summary,
        description,
        tags,
        permissions,
      });
    }
  });

  return {
    name: controllerName,
    prefix,
    routes,
  };
}

export function scanAllControllers(controllersDir: string): ControllerSpec[] {
  if (!existsSync(controllersDir)) return [];
  const result: ControllerSpec[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const full = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_SCAN_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".controller.ts") &&
        !entry.name.endsWith(".d.ts")
      ) {
        try {
          const spec = scanController(full);
          if (spec.name) result.push(spec);
        } catch {
          continue;
        }
      }
    }
  }

  walk(controllersDir);
  return result;
}

const SKIP_SCAN_DIRS = new Set([
  "node_modules", "dist", ".vscode", ".git", "scripts",
  ".next", ".agengt", ".claude", ".lingma", "turbo",
]);
