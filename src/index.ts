#!/usr/bin/env node
import { createCerebro } from "@visulima/cerebro";
import type { Toolbox } from "@visulima/cerebro";
import chalk from "@visulima/colorize";
// 静态导入所有命令
import generate from "./commands/generate.js";
import init from "./commands/init.js";
import link from "./commands/link.js";
import makePrompt from "./commands/make-prompt.js";
import scan from "./commands/scan.js";

const cli = createCerebro("api-gen", {
  packageName: "@eastgold15/api-gen",
  packageVersion: "0.1.0",
});

cli.addCommand({
  name: "init",
  description: "初始化全新 API 项目配置文件",
  argument: {
    name: "directory",
    description: "项目目录",
    type: String,
  },
  execute: async ({ argument }: Toolbox) => {
    await init(argument[0]);
    console.log(chalk.green("项目初始化完成。"));
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
  name: "link",
  description: "自动生成 controllers/index.ts，统一导出所有控制器",
  execute: async () => {
    await link();
    console.log(chalk.green("控制器链接完成。"));
  },
});

await cli.run();