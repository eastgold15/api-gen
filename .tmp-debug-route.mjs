import { parseSync } from "oxc-parser";
import { readFileSync } from "node:fs";

function parseTsFile(fileAbsPath) {
  const sourceCode = readFileSync(fileAbsPath, "utf-8");
  return parseSync("test.ts", sourceCode, {
    lang: "ts", sourceType: "module", astType: "ts",
    range: false, preserveParens: true, showSemanticErrors: false,
  });
}

function traverseAst(root, enter) {
  if (!root || !root.type) return;
  enter(root);
  for (const k of Object.keys(root)) {
    const val = root[k];
    if (Array.isArray(val)) val.forEach((child) => traverseAst(child, enter));
    else if (val && typeof val.type === "string") traverseAst(val, enter);
  }
}

function getStringValue(node) {
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  if (node?.type === "TemplateLiteral" && node.quasis?.length === 1)
    return node.quasis[0].value.raw;
  return null;
}

function getObjectProperty(objNode, propName) {
  if (objNode?.type !== "ObjectExpression") return null;
  for (const prop of objNode.properties) {
    let keyName = "";
    if (prop.key?.type === "Identifier") keyName = prop.key.name;
    if (prop.key?.type === "StringLiteral") keyName = prop.key.value;
    if (keyName === propName) return prop.value;
  }
  return null;
}

const { program } = parseTsFile("G:/tradeflow/apps/b2b-api/src/controllers/ad.controller.ts");
const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
let routeCount = 0;

traverseAst(program, (node) => {
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    const prop = node.callee.property;
    if (prop?.type !== "Identifier") return;
    const method = prop.name.toLowerCase();
    if (!HTTP_METHODS.has(method)) return;

    const args = node.arguments || [];
    const pathStr = getStringValue(args[0]);
    if (!pathStr) return;

    let detailInfo = "";
    if (args.length >= 3 && args[2]?.type === "ObjectExpression") {
      const detailObj = getObjectProperty(args[2], "detail");
      if (detailObj?.type === "ObjectExpression") {
        const s = getObjectProperty(detailObj, "summary");
        const tags = getObjectProperty(detailObj, "tags");
        const summary = s ? getStringValue(s) : "-";
        const tagList = tags?.elements?.map(el => getStringValue(el)).filter(Boolean).join(",") || "-";
        detailInfo = ` summary="${summary}" tags=[${tagList}]`;
      }
    }
    console.log(`  ✓ ${method.toUpperCase()} ${pathStr}${detailInfo}`);
    routeCount++;
  }
});

console.log(`\nTotal routes: ${routeCount}`);
