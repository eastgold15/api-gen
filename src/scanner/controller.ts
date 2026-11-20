import { parseTsFile, traverseAst, getStringValue, getObjectProperty } from "../utils/ast-scanner.js";
import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, join, basename, dirname } from "@visulima/path";

/**
 * 路由入参/出参的 schema 引用
 *
 * 新架构(契约三层分离)里,controller 的 body/query/params/response
 * 全部指向同目录 `<domain>.model.ts` 里的 `XxxModel.<Key>`。
 */
export interface RouteSchemaRef {
  /** 表达式源码文本,如 "AdModel.Create" */
  text: string;
  /** 成员表达式的对象名,如 "AdModel"(内联 zod 对象则为 null) */
  owner: string | null;
  /** 成员表达式的键名,如 "Create"(内联 zod 对象则为 null) */
  key: string | null;
}

export interface RouteSchemaRefs {
  body?: RouteSchemaRef;
  query?: RouteSchemaRef;
  params?: RouteSchemaRef;
  response?: RouteSchemaRef;
}

export interface RouteSpec {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  permissions: string[];
  /** 路由挂载的 schema(body/query/params/response) */
  schemaRefs: RouteSchemaRefs;
}

export interface ControllerSpec {
  name: string;
  prefix: string;
  routes: RouteSpec[];
  /** controller 文件所在目录的 kebab 名(= 模块名 = URL 段 = hook 文件名) */
  domain: string;
  /** controller 文件绝对路径 */
  filePath: string;
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
  const source = readFileSync(absPath, { encoding: "utf-8" });

  let controllerName = "";
  let prefix = "";
  const routes: RouteSpec[] = [];

  /**
   * 从 AST 节点取源码文本(oxc 节点带 start/end 偏移)
   */
  const nodeText = (node: any): string => {
    if (!node || typeof node.start !== "number" || typeof node.end !== "number") {
      return "";
    }
    return source.slice(node.start, node.end).trim();
  };

  /**
   * 取 schema 引用:成员表达式("AdModel.Create")拆成 owner/key;
   * 内联对象(如 t.Object({...}) / z.object({...}))只留文本。
   */
  const toSchemaRef = (node: any): RouteSchemaRef | undefined => {
    if (!node) return undefined;
    const text = nodeText(node);
    if (!text) return undefined;
    if (node.type === "MemberExpression" && !node.computed) {
      const owner = node.object?.type === "Identifier" ? node.object.name : null;
      const key = node.property?.type === "Identifier" ? node.property.name : null;
      if (owner && key) return { text, owner, key };
    }
    return { text, owner: null, key: null };
  };

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
      const schemaRefs: RouteSchemaRefs = {};

      // Elysia 的路由配置对象是**第二个**参数:`.get(path, { detail, body, ... }, handler)`。
      // 少数写法把配置放第三个,这里两个位置都兜一下。
      const configObj =
        args[1]?.type === "ObjectExpression"
          ? args[1]
          : args[2]?.type === "ObjectExpression"
            ? args[2]
            : null;

      if (configObj) {
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

        // 契约挂载点:body / query / params / response
        const bodyRef = toSchemaRef(getObjectProperty(configObj, "body"));
        if (bodyRef) schemaRefs.body = bodyRef;
        const queryRef = toSchemaRef(getObjectProperty(configObj, "query"));
        if (queryRef) schemaRefs.query = queryRef;
        const paramsRef = toSchemaRef(getObjectProperty(configObj, "params"));
        if (paramsRef) schemaRefs.params = paramsRef;
        const responseRef = toSchemaRef(getObjectProperty(configObj, "response"));
        if (responseRef) schemaRefs.response = responseRef;
      }

      routes.push({
        method: method.toUpperCase(),
        path: pathStr,
        summary,
        description,
        tags,
        permissions,
        schemaRefs,
      });
    }
  });

  return {
    name: controllerName,
    prefix,
    routes,
    domain: basename(dirname(absPath)),
    filePath: absPath,
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
