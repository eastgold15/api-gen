import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseTsFile, traverseAst } from "../utils/ast-scanner.js";

const TMP_ROOT = resolve(import.meta.dir, "../../.test-tmp/link");

// 提取 export 变量名的函数（跟 link.ts 保持一致）
function isElysiaExpression(node: any): boolean {
  if (!node) return false;
  if (
    node.type === "NewExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === "Elysia"
  ) return true;
  if (node.type === "CallExpression" && node.callee?.type === "MemberExpression") {
    return isElysiaExpression(node.callee.object);
  }
  return false;
}

function extractExportName(filePath: string): string | null {
  try {
    const { program } = parseTsFile(filePath);
    let found: string | null = null;
    traverseAst(program, (node: any) => {
      if (found) return;
      if (
        node.type === "ExportNamedDeclaration" &&
        node.declaration?.type === "VariableDeclaration" &&
        node.declaration.declarations?.length > 0
      ) {
        const d = node.declaration.declarations[0];
        if (isElysiaExpression(d.init) && d.id?.type === "Identifier") {
          found = d.id.name;
        }
      }
    });
    return found;
  } catch {
    return null;
  }
}

describe("extractExportName", () => {
  beforeAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
    mkdirSync(TMP_ROOT, { recursive: true });

    writeFileSync(
      join(TMP_ROOT, "user.controller.ts"),
      `import { Elysia } from "elysia";
export const userController = new Elysia({ prefix: "/users" })
  .get("/", () => "list");`,
    );

    writeFileSync(
      join(TMP_ROOT, "plain-export.controller.ts"),
      `export const foo = "bar";`,
    );

    writeFileSync(
      join(TMP_ROOT, "no-elysia.controller.ts"),
      `import { something } from "elsewhere";
export const notElysia = { x: 1 };`,
    );
  });

  afterAll(() => {
    if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true });
  });

  it("提取 export const xxx = new Elysia() 的变量名", () => {
    const name = extractExportName(join(TMP_ROOT, "user.controller.ts"));
    expect(name).toBe("userController");
  });

  it("非 Elysia 导出返回 null", () => {
    expect(extractExportName(join(TMP_ROOT, "plain-export.controller.ts"))).toBeNull();
    expect(extractExportName(join(TMP_ROOT, "no-elysia.controller.ts"))).toBeNull();
  });
});
