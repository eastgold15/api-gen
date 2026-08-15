import { describe, it, expect } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shouldExport, extractFileExports, type NamedExport, type ExportMode } from "../commands/barrel.js";

/** 构造一个带指定标签的 NamedExport */
const mk = (tags: string[] = [], name = "foo"): NamedExport => ({
  name,
  kind: "value",
  tags: new Set(tags),
});

describe("shouldExport 真值表", () => {
  const cases: Array<{ tags: string[]; mode: ExportMode; expected: boolean }> = [
    // full 模式:零回归,所有符号都导出(与引入可见性机制之前完全等价)
    { tags: ["public"],   mode: "full", expected: true  },
    { tags: ["internal"], mode: "full", expected: true  },
    { tags: [],           mode: "full", expected: true  },
    // lib 模式:仅 @public 导出
    { tags: ["public"],   mode: "lib",  expected: true  },
    { tags: ["internal"], mode: "lib",  expected: false },
    { tags: [],           mode: "lib",  expected: false },
  ];

  for (const { tags, mode, expected } of cases) {
    it(`tags=[${tags.join(",") || "∅"}] mode=${mode} → ${expected}`, () => {
      expect(shouldExport(mk(tags), mode)).toBe(expected);
    });
  }

  it("lib 模式:@internal 优先级高于 @public(同时存在时按 internal 判定)", () => {
    expect(shouldExport(mk(["public", "internal"]), "lib")).toBe(false);
  });

  it("其他无关标签(如 @example / @deprecated)不影响判定", () => {
    expect(shouldExport(mk(["example", "deprecated"]), "lib")).toBe(false);
    expect(shouldExport(mk(["example", "deprecated"]), "full")).toBe(true);
  });
});

describe("extractFileExports 标签归属(端到端 AST)", () => {
  let workDir: string;
  let prevCwd: string;

  function setup() {
    workDir = join(tmpdir(), `barrel-vis-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(workDir, { recursive: true });
    prevCwd = process.cwd();
    process.chdir(workDir);
  }

  function teardown() {
    process.chdir(prevCwd);
    rmSync(workDir, { recursive: true, force: true });
  }

  it("@public 函数导出在两种模式下都被保留", () => {
    setup();
    try {
      writeFileSync(
        join(workDir, "pub.ts"),
        "/** @public */\nexport const keepMe = 1;\n",
      );
      const full = extractFileExports(join(workDir, "pub.ts"), "full");
      const lib  = extractFileExports(join(workDir, "pub.ts"), "lib");
      expect(full.map((e) => e.name)).toEqual(["keepMe"]);
      expect(lib.map((e) => e.name)).toEqual(["keepMe"]);
    } finally { teardown(); }
  });

  it("@internal 函数导出:full 保留(零回归),lib 排除", () => {
    setup();
    try {
      writeFileSync(
        join(workDir, "int.ts"),
        "/**\n * 内部辅助\n *\n * @internal\n */\nexport const dropMe = 1;\n",
      );
      expect(extractFileExports(join(workDir, "int.ts"), "full").map((e) => e.name)).toEqual(["dropMe"]);
      expect(extractFileExports(join(workDir, "int.ts"), "lib")).toEqual([]);
    } finally { teardown(); }
  });

  it("未标注函数导出:full 模式保留,lib 模式排除", () => {
    setup();
    try {
      writeFileSync(
        join(workDir, "plain.ts"),
        "/**\n * 普通描述,无标签\n */\nexport const plain = 1;\n",
      );
      const full = extractFileExports(join(workDir, "plain.ts"), "full");
      const lib  = extractFileExports(join(workDir, "plain.ts"), "lib");
      expect(full.map((e) => e.name)).toEqual(["plain"]);
      expect(lib).toEqual([]);
    } finally { teardown(); }
  });

  it("混合标注与未标注:full 全量,lib 只保留 @public", () => {
    setup();
    try {
      writeFileSync(
        join(workDir, "mixed.ts"),
        "/** @public */\nexport const kept = 1;\n/** @internal */\nexport const dropped = 2;\n/** 无标签 */\nexport const plain = 3;\n",
      );
      const fullNames = extractFileExports(join(workDir, "mixed.ts"), "full").map((e) => e.name).sort();
      const libNames  = extractFileExports(join(workDir, "mixed.ts"), "lib").map((e) => e.name).sort();
      // full:零回归,@internal 也要保留(子 barrel 内部需要)
      expect(fullNames).toEqual(["dropped", "kept", "plain"]);
      // lib:只 @public
      expect(libNames).toEqual(["kept"]);
    } finally { teardown(); }
  });

  it("类型导出(export type)同样受 lib 模式 tag 约束,full 模式全量", () => {
    setup();
    try {
      writeFileSync(
        join(workDir, "types.ts"),
        "/** @public */\nexport type PublicType = string;\n/** @internal */\nexport type InternalType = number;\n",
      );
      const full = extractFileExports(join(workDir, "types.ts"), "full");
      const lib  = extractFileExports(join(workDir, "types.ts"), "lib");
      const fullNames = full.map((e) => e.name).sort();
      const libNames  = lib.map((e) => e.name).sort();
      // full 模式:@internal 类型也保留
      expect(fullNames).toEqual(["InternalType", "PublicType"]);
      expect(full.find((e) => e.name === "PublicType")?.kind).toBe("type");
      // lib 模式:只 @public 类型
      expect(libNames).toEqual(["PublicType"]);
    } finally { teardown(); }
  });
});
