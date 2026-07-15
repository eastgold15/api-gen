import { parseSync, ParseResult } from "oxc-parser";
import fs from "node:fs";
import path from "node:path";

export function parseTsFile(fileAbsPath: string): ParseResult {
  const sourceCode = fs.readFileSync(fileAbsPath, "utf-8");
  const fileName = path.basename(fileAbsPath);

  return parseSync(fileName, sourceCode, {
    lang: "ts",
    sourceType: "module",
    astType: "ts",
    range: false,
    preserveParens: true,
    showSemanticErrors: false,
  });
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