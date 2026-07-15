import fs from "node:fs";
import path from "node:path";

// 业务分层后缀
type Layer = "controller" | "server" | "schema" | "relation" | "contract";
const LAYERS: Layer[] = ["controller", "server", "schema", "relation", "contract"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".vscode", ".git", "scripts", "src", "commands", "generator", "scanner", "types", "utils", "shared"]);

type DirInfo = {
  relative: string;
  layers: Record<Layer, string[]>;
  children: DirInfo[];
};

/** 递归扫描生成目录树结构对象 */
function scanDirTree(rootAbs: string, rootRel: string): DirInfo {
  const dir: DirInfo = {
    relative: rootRel,
    layers: { controller: [], server: [], schema: [], relation: [], contract: [] },
    children: [],
  };
  const entries = fs.readdirSync(rootAbs, { withFileTypes: true });
  const childDirs: string[] = [];

  for (const entry of entries) {
    const fullAbs = path.resolve(rootAbs, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      childDirs.push(fullAbs);
      continue;
    }
    // 匹配 xxx.layer.ts
    const match = entry.name.match(/\.(\w+)\.ts$/);
    if (!match) continue;
    const layer = match[1] as Layer;
    if (!LAYERS.includes(layer)) continue;
    dir.layers[layer].push(entry.name);
  }

  // 递归子目录
  for (const childAbs of childDirs) {
    const childRel = path.join(rootRel, path.basename(childAbs));
    dir.children.push(scanDirTree(childAbs, childRel));
  }
  return dir;
}

/** 将DirInfo树形对象转为终端tree字符串（structureTree最终值） */
function renderTreeText(root: DirInfo): string {
  const lines: string[] = ["project-root"];

  function walk(node: DirInfo, prefix: string) {
    const layerEntries: { label: Layer; files: string[] }[] = [];
    for (const l of LAYERS) {
      if (node.layers[l].length > 0) layerEntries.push({ label: l, files: node.layers[l] });
    }
    // 输出当前目录分层文件行
    for (let i = 0; i < layerEntries.length; i++) {
      const item = layerEntries[i];
      const isLast = i === layerEntries.length - 1 && node.children.length === 0;
      const branch = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${branch}${item.label}: ${item.files.join(", ")}`);
    }
    // 输出子目录
    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      const isLastChild = i === node.children.length - 1;
      const dirName = path.basename(child.relative);
      const branch = isLastChild ? "└── " : "├── ";
      lines.push(`${prefix}${branch}${dirName}`);
      // 子层级前缀
      const nextPrefix = prefix + (isLastChild ? "    " : "│   ");
      walk(child, nextPrefix);
    }
  }

  walk(root, "");
  return lines.join("\n");
}

/** 入口：扫描项目根目录，直接返回可放入structureTree的文本 */
export function buildStructureTree(rootProjectDir: string): string {
  const rootTree = scanDirTree(rootProjectDir, ".");
  return renderTreeText(rootTree);
}