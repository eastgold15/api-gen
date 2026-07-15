import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

const ROUTE_METHODS = ["get", "post", "put", "delete", "patch"];

/**
 * 从指定起始下标提取一对平衡大括号 { ... } 完整内容
 * 起始下标对应字符必须是 {
 * 括号不匹配时返回空字符串
 */
function extractBracedBlock(text: string, startIndex: number): string {
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === "{") {
      depth++;
    } else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }
  return "";
}

/**
 * 在函数字符串参数中提取最后一组完整大括号配置对象
 * 要求对象前存在逗号，代表是 Elysia 路由配置参数（非处理函数体）
 * 匹配成功返回带外层括号的对象字符串，无匹配返回 null
 */
function extractRouteConfig(argsStr: string): string | null {
  let depth = 0;
  let end = -1;

  for (let i = argsStr.length - 1; i >= 0; i--) {
    if (argsStr[i] === "}") {
      if (depth === 0) {
        end = i;
      }
      depth++;
    } else if (argsStr[i] === "{") {
      depth--;
      if (depth === 0 && end !== -1) {
        const block = argsStr.slice(i, end + 1);
        // 配置对象前必须有逗号或左括号（第三个参数）
        const before = argsStr.slice(0, i).trimEnd();
        if (before.endsWith(",") || before.endsWith("(")) {
          return block;
        }
        return null;
      }
    }
  }
  return null;
}

/**
 * 解析接口详情配置对象，提取接口摘要、描述、分类标签
 * 参数为大括号内部纯内容字符串
 */
function parseDetailObject(
  detailStr: string,
): { summary: string; description: string; tags: string[] } {
  const summaryMatch = detailStr.match(/summary\s*:\s*['"`]([^'"`]*)['"`]/);
  const descriptionMatch = detailStr.match(
    /description\s*:\s*['"`]([^'"`]*)['"`]/,
  );

  const tags: string[] = [];
  const tagsMatch = detailStr.match(/tags\s*:\s*\[([\s\S]*?)\]/);
  if (tagsMatch) {
    const items = tagsMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ""))
      .filter(Boolean);
    tags.push(...items);
  }

  return {
    summary: summaryMatch ? summaryMatch[1] : "",
    description: descriptionMatch ? descriptionMatch[1] : "",
    tags,
  };
}

/**
 * 解析完整路由配置对象，提取接口详情与权限列表
 * 入参包含外层大括号完整对象字符串
 */
function parseRouteConfig(
  configStr: string,
): {
  detail: { summary: string; description: string; tags: string[] };
  permissions: string[];
} {
  // 解析接口详情
  let detail: { summary: string; description: string; tags: string[] } = {
    summary: "",
    description: "",
    tags: [],
  };

  const detailKeyMatch = configStr.match(/detail\s*:\s*/);
  if (detailKeyMatch) {
    const afterKey = configStr.slice(
      detailKeyMatch.index! + detailKeyMatch[0].length,
    );
    const braceIdx = afterKey.search(/\S/);
    if (braceIdx !== -1 && afterKey[braceIdx] === "{") {
      const block = extractBracedBlock(afterKey, braceIdx);
      if (block) {
        detail = parseDetailObject(block);
      }
    }
  }

  // 解析接口权限标识
  const permissions: string[] = [];
  const permMatch = configStr.match(/allPermissions\s*:\s*\[([\s\S]*?)\]/);
  if (permMatch) {
    const items = permMatch[1]
      .split(",")
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ""))
      .filter(Boolean);
    permissions.push(...items);
  }

  return { detail, permissions };
}

/**
 * 扫描单个 Elysia 控制器 .controller.ts 文件，提取完整路由信息
 *
 * 提取内容：
 * - 控制器导出变量名称
 * - new Elysia 定义的路由统一前缀 prefix
 * - 所有 .get/.post/.put/.delete/.patch 路由，包含请求路径、
 *   OpenAPI 文档信息（摘要、描述、标签）、权限标识
 */
export function scanController(filePath: string): ControllerSpec {
  const content = readFileSync(filePath, "utf-8");

  // 控制器变量名称
  const nameMatch = content.match(
    /export\s+const\s+(\w+)\s*=\s*new\s+Elysia/,
  );
  const name = nameMatch ? nameMatch[1] : "";

  // 路由统一前缀 prefix
  const prefix = content.match(
    /new\s+Elysia\s*\(\s*\{[\s\S]*?prefix\s*:\s*['"`]([^'"`]+)['"`]/,
  )?.[1] ?? "";

  // 遍历所有路由方法调用
  const routes: RouteSpec[] = [];
  const methodRegex = new RegExp(
    `\\.(${ROUTE_METHODS.join("|")})\\s*\\(`,
    "g",
  );
  let methodMatch: RegExpExecArray | null;

  while ((methodMatch = methodRegex.exec(content)) !== null) {
    const method = methodMatch[1]!;
    const parenStart = methodMatch.index + methodMatch[0].length - 1;

    // 匹配闭合括号，处理函数参数多层嵌套
    let depth = 0;
    let callEnd = -1;
    for (let i = parenStart; i < content.length; i++) {
      if (content[i] === "(") depth++;
      else if (content[i] === ")") {
        depth--;
        if (depth === 0) {
          callEnd = i;
          break;
        }
      }
    }
    if (callEnd === -1) continue;

    // 截取括号内所有参数文本
    const argsFull = content.slice(parenStart, callEnd + 1);
    const argsInner = argsFull.slice(1, -1).trim();

    // 第一个参数：接口请求路径字符串
    const pathMatch = argsInner.match(/^\s*['"`]([^'"`]+)['"`]/);
    if (!pathMatch) continue;
    const path = pathMatch[1]!;

    // 最后一个参数：路由配置对象
    const configBlock = extractRouteConfig(argsInner);
    if (!configBlock) continue;

    const { detail, permissions } = parseRouteConfig(configBlock);

    routes.push({
      method: method.toUpperCase(),
      path,
      summary: detail.summary,
      description: detail.description,
      tags: detail.tags,
      permissions,
    });
  }

  return { name, prefix, routes };
}

/**
 * 遍历控制器目录下所有 *.controller.ts 文件（不递归子文件夹）
 * 批量提取所有控制器路由信息
 *
 * 读取/解析失败的文件会直接跳过，不中断整体扫描流程
 */
export function scanAllControllers(controllersDir: string): ControllerSpec[] {
  if (!existsSync(controllersDir)) {
    return [];
  }

  const files = readdirSync(controllersDir).filter(
    (f) => f.endsWith(".controller.ts") && !f.endsWith(".d.ts"),
  );

  return files
    .map((f) => {
      try {
        return scanController(join(controllersDir, f));
      } catch {
        return null;
      }
    })
    .filter((spec): spec is ControllerSpec => spec !== null);
}