import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "@visulima/path";
import { globSync } from "tinyglobby";
import { pail } from "@visulima/pail";
import type { Step } from "../types/api-gen.json.js";

/**
 * 根据 glob 模式匹配文件，返回相对于 cwd 的路径数组
 */
export function selectFiles(pattern: string): string[] {
  return globSync(pattern, {
    cwd: process.cwd(),
    dot: true,
    ignore: ["node_modules/**", ".git/**", "dist/**"],
  });
}

/**
 * 在文件头部插入内容（幂等：已以 content 开头则跳过）
 */
export function prepend(files: string[], content: string): void {
  const block = content.endsWith("\n") ? content : content + "\n";

  for (const file of files) {
    const path = resolve(process.cwd(), file);
    let original: string;
    try {
      original = readFileSync(path, "utf-8");
    } catch {
      continue;
    }
    if (original.startsWith(block)) continue;
    writeFileSync(path, block + original, "utf-8");
  }
}

/**
 * 运行一条管道的步骤序列
 *
 * 执行模型：
 *  - "select" 替换当前文件集
 *  - 其他操作步骤消费当前文件集，不替换
 */
export function runPipeline(steps: Step[]): void {
  let files: string[] = [];

  for (const step of steps) {
    switch (step.type) {
      case "select": {
        files = selectFiles(step.glob);
        if (files.length === 0) {
          pail.warn(`select 未匹配到文件：${step.glob}`);
        } else {
          pail.info(`select 匹配到 ${files.length} 个文件：${step.glob}`);
        }
        break;
      }
      case "prepend": {
        if (files.length === 0) {
          pail.warn("当前文件集为空，跳过 prepend");
          break;
        }
        prepend(files, step.content);
        pail.success(`prepend 完成，处理 ${files.length} 个文件`);
        break;
      }
    }
  }
}
