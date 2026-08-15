import { describe, it, expect } from "bun:test";
import { parseJsDocTags, findPrecedingJsDoc } from "../utils/jsdoc-tags.js";

describe("parseJsDocTags", () => {
  it("抽取单行 JSDoc 块中的 @public", () => {
    const body = " * @public\n * Some description.\n ";
    expect(parseJsDocTags(body).has("public")).toBe(true);
  });

  it("抽取 @internal", () => {
    expect(parseJsDocTags(" * @internal\n ").has("internal")).toBe(true);
  });

  it("抽取多标签", () => {
    const tags = parseJsDocTags(`
 * @public
 * @example
 * const x = 1;
 * @returns {void}
 * @param {string} name
 `);
    expect([...tags].sort()).toEqual(["example", "param", "public", "returns"]);
  });

  it("无 @ 前缀的纯描述返回空集合", () => {
    expect(parseJsDocTags(" * just a description with no tags\n ").size).toBe(0);
  });

  it("正文里行内的 @ 提及不会被当作标签", () => {
    // 正文行内 @user.name 不是行首的 @xxx,应忽略
    const body = " * Contact: @user.name for support\n";
    expect(parseJsDocTags(body).has("user.name")).toBe(false);
  });

  it("支持标签紧跟 /** opener(无换行)", () => {
    expect(parseJsDocTags("* @public hi").has("public")).toBe(true);
  });

  it("@param {string} name 仍能识别出 param 标签", () => {
    const tags = parseJsDocTags(" * @param {string} name\n");
    expect(tags.has("param")).toBe(true);
  });

  it("空字符串返回空集合", () => {
    expect(parseJsDocTags("").size).toBe(0);
  });

  it("支持连字符标签(如 @internal-remarks)", () => {
    const tags = parseJsDocTags(" * @internal-remarks\n");
    expect(tags.has("internal-remarks")).toBe(true);
  });

  it("标签名大小写归一为小写", () => {
    const tags = parseJsDocTags(" * @Public\n * @INTERNAL\n");
    expect(tags.has("public")).toBe(true);
    expect(tags.has("internal")).toBe(true);
  });
});

describe("findPrecedingJsDoc", () => {
  it("返回目标节点前最近的一个块注释 body", () => {
    const comments = [
      { type: "Block", value: " older", start: 0, end: 8 },
      { type: "Block", value: " * @public", start: 20, end: 25 },
    ];
    // 第一个块离目标 22 字节,超过 8 → reset;第二个块紧贴目标 → 返回
    expect(findPrecedingJsDoc(comments, 30)).toBe(" * @public");
  });

  it("目标节点前无任何注释时返回 null", () => {
    const comments = [
      { type: "Block", value: " far away", start: 0, end: 8 },
    ];
    expect(findPrecedingJsDoc(comments, 1000)).toBe(null);
  });

  it("忽略 // 行注释", () => {
    const comments = [{ type: "Line", value: " @public", start: 0, end: 8 }];
    expect(findPrecedingJsDoc(comments, 20)).toBe(null);
  });

  it("注释距离目标节点过远(> 8 字节)时重置为 null,避免误关联", () => {
    const comments = [
      { type: "Block", value: " * @public", start: 0, end: 12 },
      { type: "Block", value: " * some other comment", start: 100, end: 130 },
    ];
    // 第一个 @public 块离目标 50-12=38 字节 > 8 → 视为无关
    expect(findPrecedingJsDoc(comments, 50)).toBe(null);
  });

  it("注释正好紧贴目标节点时返回该注释", () => {
    const comments = [{ type: "Block", value: " * @public", start: 0, end: 12 }];
    expect(findPrecedingJsDoc(comments, 12)).toBe(" * @public");
  });
});
