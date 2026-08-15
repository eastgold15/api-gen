import { parseSync, ParseResult, Comment } from "oxc-parser";
import { readFileSync } from "@visulima/fs";
import { basename } from "@visulima/path";

export interface TsParseResult {
  program: ParseResult["program"];
  comments: ReadonlyArray<Comment>;
  errors: ParseResult["errors"];
}

/** 解析 .ts 文件,返回 program + 顶层注释 + 错误。便于 barrel 在 AST 阶段读取 JSDoc/TSDoc 标签 */
export function parseTsFile(fileAbsPath: string): TsParseResult {
  const sourceCode = readFileSync(fileAbsPath);
  const fileName = basename(fileAbsPath);

  const result = parseSync(fileName, sourceCode, {
    lang: "ts",
    sourceType: "module",
    astType: "ts",
    range: false,
    preserveParens: true,
    showSemanticErrors: false,
  });

  return {
    program: result.program,
    comments: result.comments ?? [],
    errors: result.errors,
  };
}

type AstNode = Record<string, any>;
/** 深度优先遍历AST */
export function traverseAst(root: AstNode, enter: (node: AstNode) => void) {
  if (!root || !root.type) return;
  enter(root);
  for (const k of Object.keys(root)) {
    const val = root[k];
    if (Array.isArray(val)) val.forEach((child) => traverseAst(child, enter));
    else if (val && typeof val.type === "string") traverseAst(val, enter);
  }
}

/** 提取字符串字面量 */
export function getStringValue(node: AstNode): string | null {
  if (node.type === "StringLiteral") return node.value;
  // OXc 在某些位置用 Literal 统一类型（arguments 中的字符串）
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.quasis.length === 1)
    return node.quasis[0].value.raw;
  return null;
}

/** 读取对象字面量指定key节点 */
export function getObjectProperty(objNode: AstNode, propName: string): AstNode | null {
  if (objNode.type !== "ObjectExpression") return null;
  for (const prop of objNode.properties) {
    let keyName = "";
    if (prop.key.type === "Identifier") keyName = prop.key.name;
    if (prop.key.type === "StringLiteral") keyName = prop.key.value;
    if (keyName === propName) return prop.value;
  }
  return null;
}
