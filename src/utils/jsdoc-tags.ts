/**
 * JSDoc / TSDoc 注释标签解析
 *
 * 用于 `api-gen barrel` 在生成桶导出时,根据源码符号上方的块注释决定
 * 该符号是否对外暴露（@public / @internal）。typedoc 也会认这两个标签,
 * 因此 barrel 与 typedoc 的可见性可保持一致。
 */

interface RawComment {
  type: string;
  value: string;
  start: number;
  end: number;
}

/**
 * 抽取 JSDoc 块注释中的所有标签名,返回小写集合。
 *
 * 规则:
 * - 只识别行首的 `@xxx`（允许多行 JSDoc 的 `*` 行前缀）
 * - 标签名由字母/数字/连字符组成
 * - 描述正文里的 `@user.name` 这类内联提及不会被当成标签
 *
 * @example
 * parseJsDocTags(" * @public\n * @example\n * foo\n");
 * // => Set { "public", "example" }
 */
export function parseJsDocTags(comment: string): Set<string> {
  const tags = new Set<string>();
  if (!comment) return tags;
  const re = /^\s*\*?\s*@([a-zA-Z][a-zA-Z0-9-]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(comment)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return tags;
}

/**
 * 在按 start 升序排列的注释数组中,找到离目标节点最近的、紧邻的块注释
 * (`/** ... *\/`) 的正文。`//` 行注释被忽略。
 *
 * 允许的最大间距 8 字节,用于吸收换行 + 可选的 `*` 续行前缀;间距过大
 * 视为另一个独立注释,重置为 `null`,避免误把远处注释关联到目标节点。
 */
export function findPrecedingJsDoc(
  comments: ReadonlyArray<RawComment>,
  nodeStart: number,
): string | null {
  let result: string | null = null;
  for (const c of comments) {
    if (c.type !== "Block") continue;
    if (c.end > nodeStart) break;
    if (nodeStart - c.end > 8) {
      result = null;
      continue;
    }
    result = c.value;
  }
  return result;
}
