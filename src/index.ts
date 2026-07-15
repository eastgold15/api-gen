#!/usr/bin/env bun
import { execSync } from "node:child_process";
import Cli from "@visulima/cerebro";
import type { Toolbox } from "@visulima/cerebro";
import chalk from "@visulima/colorize";

// Windows 终端 UTF-8 编码修正（避免中文乱码）
if (process.platform === "win32") {
  try {
    execSync("chcp 65001", { stdio: "pipe" });
  } catch {
    // 忽略失败
  }
}

const cli = new Cli("api-gen", {
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
    const { default: init } = await import("./commands/init.js");
    await init(argument[0]);
    console.log(chalk.green("项目初始化完成。"));
  },
});

cli.addCommand({
  name: "scan",
  description: "扫描现有项目，自动解析 API 结构",
  options: [
    {
      name: "path",
      alias: "p",
      description: "待扫描目录",
      type: String,
      defaultValue: ".",
    },
  ],
  execute: async ({ options }: Toolbox) => {
    const { default: scan } = await import("./commands/scan.js");
    await scan(options.path);
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
    const { default: makePrompt } = await import("./commands/make-prompt.js");
    await makePrompt({ tag: options.tag, path: options.path });
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
    const { default: generate } = await import("./commands/generate.js");
    await generate(options.output);
    console.log(chalk.green("代码生成完成。"));
  },
});

await cli.run();
