import { parseTsFile, traverseAst, getStringValue, getObjectProperty } from "../utils/ast-scanner.js";
import fs from "node:fs";
import path from "node:path";

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

export function scanController(filePath: string): ControllerSpec {
  const absPath = path.resolve(filePath);
  const { program } = parseTsFile(absPath);

  let controllerName = "";
  let prefix = "";
  const routes: RouteSpec[] = [];

  traverseAst(program, (node) => {
    // 匹配 new Elysia({ prefix: "" })
    if (node.type === "VariableDeclaration" && !node.declare) {
      for (const decl of node.declarations) {
        const init = decl.init;
        if (!init || init.type !== "NewExpression") continue;
        const callee = init.callee;
        if (callee.type === "Identifier" && callee.name === "Elysia") {
          const id = decl.id;
          if (id.type === "Identifier") controllerName = id.name;
          const args = init.arguments;
          if (args[0]?.type === "ObjectExpression") {
            const prefixNode = getObjectProperty(args[0], "prefix");
            if (prefixNode) {
              const val = getStringValue(prefixNode);
              if (val) prefix = val;
            }
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
  if (!fs.existsSync(controllersDir)) return [];
  const entries = fs.readdirSync(controllersDir, { withFileTypes: true });
  const result: ControllerSpec[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".controller.ts") && !entry.name.endsWith(".d.ts")) {
      try {
        const spec = scanController(path.join(controllersDir, entry.name));
        if (spec.name) result.push(spec);
      } catch {
        continue;
      }
    }
  }
  return result;
}
