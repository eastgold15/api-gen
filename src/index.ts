#!/usr/bin/env node
import { createCerebro } from "@visulima/cerebro";
import type { Toolbox } from "@visulima/cerebro";
import chalk from "@visulima/colorize";
// 静态导入所有命令
import archive from "./commands/archive.js";
import barrel from "./commands/barrel.js";
import generate from "./commands/generate.js";
import info from "./commands/info.js";
import init from "./commands/init.js";
import link from "./commands/link.js";
import makePrompt from "./commands/make-prompt.js";
import raw from "./commands/raw.js";
import scan from "./commands/scan.js";
import sync from "./commands/sync.js";

const cli = createCerebro("api-gen", {
  packageName: "@eastgold15/api-gen",
  packageVersion: "0.1.0",
});

cli.addCommand({
  name: "init",
  description: "生成 CLI 脚本配置（.vscode/api-config.json）",
  execute: async () => {
    await init();
    console.log(chalk.green("脚本配置初始化完成。"));
  },
});

cli.addCommand({
  name: "sync",
  description: "扫描项目目录，更新 exportIndex 路径配置",
  execute: async () => {
    await sync();
    console.log(chalk.green("配置同步完成。"));
  },
});

cli.addCommand({
  name: "info",
  description: "检测项目结构，生成 AI 上下文配置（.vscode/api-gen.json）",
  argument: {
    name: "directory",
    description: "项目目录",
    type: String,
  },
  execute: async ({ argument }: Toolbox) => {
    await info(argument[0]);
  },
});

cli.addCommand({
  name: "scan",
  description: "扫描现有项目，自动解析 API 结构",
  execute: async () => {
    await scan();
    console.log(chalk.green("项目扫描完成。"));
  },
});

cli.addCommand({
  name: "make-prompt",
  description: "生成 AI 提示词文件（基于模板 + 扫描产物）",
  options: [
    {
      name: "tag",
      alias: "t",
      description: "按业务标签筛选接口",
      type: String,
    },
    {
      name: "path",
      alias: "p",
      description: "按路由路径筛选单条接口",
      type: String,
    },
  ],
  execute: async ({ options }: Toolbox) => {
    await makePrompt({ tag: options.tag as string | undefined, path: options.path as string | undefined });
    console.log(chalk.green("提示词文件生成完成。"));
  },
});

cli.addCommand({
  name: "generate",
  description: "根据项目结构生成 API 代码文件",
  options: [
    {
      name: "output",
      alias: "o",
      description: "代码输出目录",
      type: String,
      defaultValue: "./generated",
    },
  ],
  execute: async ({ options }: Toolbox) => {
    await generate(options.output as string);
    console.log(chalk.green("代码生成完成。"));
  },
});

cli.addCommand({
  name: "raw",
  description: "解析 drizzle schema，自动生成 dto/raw/*.raw.ts 基础字段定义",
  execute: async () => {
    await raw();
    console.log(chalk.green("Raw DTO 文件生成完成。"));
  },
});

cli.addCommand({
  name: "barrel",
  description: "扫描目录，自动生成级联 index.ts 桶导出（Tree Shaking 友好）",
  options: [
    {
      name: "group",
      alias: "g",
      description: "按组名筛选，只处理指定组",
      type: String,
    },
    {
      name: "dry-run",
      alias: "d",
      description: "预览模式，不写入文件",
      type: Boolean,
    },
    {
      name: "lib",
      description: "库导出模式:仅导出 @public 标记的符号(@internal / 未标注均不导出)",
      type: Boolean,
    },
  ],
  execute: async ({ options }: Toolbox) => {
    await barrel({
      group: options.group as string | undefined,
      dryRun: options.dryRun as boolean | undefined,
      lib: options.lib as boolean | undefined,
    });
    console.log(chalk.green("桶导出生成完成。"));
  },
});

cli.addCommand({
  name: "link",
  description: "自动生成 controllers/index.ts，统一导出所有控制器",
  execute: async () => {
    await link();
    console.log(chalk.green("控制器链接完成。"));
  },
});

cli.addCommand({
  name: "archive",
  description: "把项目目录打包成 .tar.gz 用于服务器部署（基于 .gitignore 风格过滤）",
  options: [
    {
      name: "output-dir",
      alias: "o",
      description: "归档输出目录，默认项目根",
      type: String,
    },
    {
      name: "prefix",
      description: "归档文件名前缀，默认 project",
      type: String,
    },
    {
      name: "dry-run",
      description: "只扫描不写文件",
      type: Boolean,
    },
  ],
  execute: async ({ options }: Toolbox) => {
    await archive({
      outputDir: options.outputDir as string | undefined,
      prefix: options.prefix as string | undefined,
      dryRun: options.dryRun as boolean | undefined,
    });
  },
});

await cli.run();
