#!/usr/bin/env bun
import { Command } from "commander";
import chalk from "chalk";

const program = new Command();

program
  .name("api-gen")
  .description("API 脚手架与代码生成工具")
  .version("0.1.0");

program
  .command("init")
  .description("初始化全新 API 项目配置文件")
  .argument("[directory]", "项目目录", ".")
  .action(async (directory: string) => {
    const { default: init } = await import("./commands/init.js");
    await init(directory);
    console.log(chalk.green("项目初始化完成。"));
  });

program
  .command("scan")
  .description("扫描现有项目，自动解析 API 结构")
  .option("-p, --path <path>", "待扫描目录", ".")
  .action(async (options: { path: string }) => {
    const { default: scan } = await import("./commands/scan.js");
    await scan(options.path);
    console.log(chalk.green("项目扫描完成。"));
  });

program
  .command("make-prompt")
  .description("生成 AI 提示词文件（基于模板 + 扫描产物）")
  .option("-t, --tag <tag>", "按业务标签筛选接口")
  .option("-p, --path <path>", "按路由路径筛选单条接口")
  .action(async (options: { tag?: string; path?: string }) => {
    const { default: makePrompt } = await import("./commands/make-prompt.js");
    await makePrompt(options);
    console.log(chalk.green("提示词文件生成完成。"));
  });

program
  .command("generate")
  .description("根据项目结构生成 API 代码文件")
  .option("-o, --output <path>", "代码输出目录", "./generated")
  .action(async (options: { output: string }) => {
    const { default: generate } = await import("./commands/generate.js");
    await generate(options.output);
    console.log(chalk.green("代码生成完成。"));
  });

program.parse(process.argv);
