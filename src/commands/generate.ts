#!/usr/bin/env bun
import { existsSync, readdirSync } from "node:fs";
import { readFileSync, writeFileSync, ensureDirSync } from "@visulima/fs";
import { resolve, dirname, join } from "@visulima/path";
import chalk from "@visulima/colorize";
import {
  callAI,
  buildSystemPrompt,
  buildGenerationPrompt,
  type AIConfig,
  type ProjectLayout as GeneratorLayout,
  type ControllerSpec as AIControllerSpec,
} from "../generator/ai.js";
import type { ApiGenRootConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 本地配置/规格文件类型定义
// ---------------------------------------------------------------------------

interface RouteSpec {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  permissions: string[];
}

interface ControllerSpec {
  name: string;
  prefix: string;
  routes: RouteSpec[];
}

interface ApiSpecFile {
  modules: ControllerSpec[];
}

/** AI 返回 JSON 的结构定义 */
interface AIAdditions {
  schemaAdditions?: Record<string, string>;
  contractAdditions?: Record<string, string>;
  summary?: string;
}

interface ModuleGroup {
  tag: string;
  routes: RouteSpec[];
  controllerNames: string[];
}

// ---------------------------------------------------------------------------
// 工具辅助函数
// ---------------------------------------------------------------------------

const CWD = process.cwd();

function readJson<T>(filePath: string): T {
  const fullPath = resolve(CWD, filePath);
  const raw = readFileSync(fullPath, { encoding: "utf-8" });
  return JSON.parse(raw) as T;
}

/**
 * 将 ApiGenRootConfig 转换为生成器所需的 GeneratorLayout（含文件代码片段）
 */
function toGeneratorLayout(config: ApiGenRootConfig): GeneratorLayout {
  const existingTables: string[] = [];
  const existingContracts: string[] = [];

  // 从 common 层读取 schema 和 contract
  if (config.common) {
    for (const sf of config.common.schemaFiles) {
      try {
        const fullPath = resolve(CWD, sf);
        existingTables.push(readFileSync(fullPath, { encoding: "utf-8" }));
      } catch {
        console.warn(chalk.yellow(`  [警告] 读取数据表文件失败：${sf}`));
      }
    }
    for (const cf of config.common.contractFiles) {
      try {
        const fullPath = resolve(CWD, cf);
        existingContracts.push(readFileSync(fullPath, { encoding: "utf-8" }));
      } catch {
        console.warn(chalk.yellow(`  [警告] 读取合约文件失败：${cf}`));
      }
    }
  }

  // 也在每个 app 的 server 目录下查找 schema/contract
  for (const app of config.apps) {
    if (app.serverDir) {
      const serverAbs = resolve(CWD, app.serverDir);
      try {
        const entries = readdirSync(serverAbs, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          if (entry.name.endsWith(".schema.ts")) {
            existingTables.push(
              readFileSync(join(serverAbs, entry.name), { encoding: "utf-8" }),
            );
          }
          if (entry.name.endsWith(".contract.ts")) {
            existingContracts.push(
              readFileSync(join(serverAbs, entry.name), { encoding: "utf-8" }),
            );
          }
        }
      } catch {
        // 目录不存在则跳过
      }
    }
  }

  return {
    projectStructure: {},
    existingTables,
    existingContracts,
    namingConventions: {
      tableNaming: "snake_case 下划线",
      columnNaming: "snake_case 下划线",
      routeNaming: "kebab-case 短横线",
      fileNaming: "kebab-case 短横线",
    },
    structureTree: config.structureTree,
  };
}

function groupRoutesByTags(controllers: ControllerSpec[]): ModuleGroup[] {
  const tagMap = new Map<
    string,
    { routes: RouteSpec[]; controllerNames: Set<string> }
  >();

  for (const ctrl of controllers) {
    for (const route of ctrl.routes) {
      const tags = route.tags.length > 0 ? route.tags : ["default"];
      for (const tag of tags) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, { routes: [], controllerNames: new Set() });
        }
        tagMap.get(tag)!.routes.push(route);
        tagMap.get(tag)!.controllerNames.add(ctrl.name);
      }
    }
  }

  return Array.from(tagMap.entries()).map(([tag, data]) => ({
    tag,
    routes: data.routes,
    controllerNames: Array.from(data.controllerNames).sort(),
  }));
}

function identifyCommonColumns(schemaSnippets: string[]): string[] {
  const knownColumns = [
    "id",
    "createdAt",
    "updatedAt",
    "siteId",
    "exporterId",
    "factoryId",
    "ownerId",
    "isPublic",
  ];

  if (schemaSnippets.length === 0) return knownColumns;

  const countOccurrences = (col: string): number => {
    let count = 0;
    for (const snippet of schemaSnippets) {
      const re = new RegExp(`\\b${col}\\b`);
      if (re.test(snippet)) count++;
    }
    return count;
  };

  const threshold = Math.max(1, Math.floor(schemaSnippets.length * 0.4));
  return knownColumns.filter((col) => countOccurrences(col) >= threshold);
}

function buildSharedInfo(
  moduleGroups: ModuleGroup[],
  commonColumns: string[],
): string {
  const lines: string[] = [];

  lines.push("### 接口模块分组信息");
  lines.push("");
  lines.push("所有接口已根据 OpenAPI 标签分为如下业务模块：");
  lines.push("");
  for (const group of moduleGroups) {
    lines.push(
      `- **${group.tag}**（共 ${group.routes.length} 条接口，来源控制器：${group.controllerNames.join(", ")}）`,
    );
  }
  lines.push("");

  lines.push("### 项目通用模板字段");
  lines.push("");
  if (commonColumns.length > 0) {
    lines.push("以下字段在绝大多数表中存在，新建数据表必须统一包含：");
    for (const col of commonColumns) {
      lines.push(`  - \`${col}\``);
    }
  } else {
    lines.push("未检测到项目通用模板字段。");
  }
  lines.push("");

  return lines.join("\n");
}

function writeSchemaFile(filePath: string, content: string): void {
  const absPath = resolve(CWD, filePath);
  ensureDirSync(dirname(absPath));
  const existing = existsSync(absPath) ? readFileSync(absPath) : "";
  writeFileSync(absPath, existing ? `${existing}\n${content.trim()}\n` : `${content.trim()}\n`);
}

function writeContractFile(filePath: string, content: string): void {
  const absPath = resolve(CWD, filePath);
  ensureDirSync(dirname(absPath));
  writeFileSync(absPath, `${content.trim()}\n`);
}

function validateEnvironment(): string | null {
  const genPath = resolve(CWD, ".vscode/api-gen.json");
  const specPath = resolve(CWD, ".vscode/api-spec.json");

  if (!existsSync(genPath)) {
    return `缺少配置文件 .vscode/api-gen.json，请先执行 api-gen init`;
  }
  if (!existsSync(specPath)) {
    return `缺少接口扫描文件 .vscode/api-spec.json，请先执行 api-gen scan`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// generate 主生成命令
// ---------------------------------------------------------------------------

export async function generateCommand(): Promise<void> {
  console.log(chalk.blue("正在执行 api-gen 代码生成...\n"));

  const validationError = validateEnvironment();
  if (validationError) {
    console.error(chalk.red(validationError));
    process.exit(1);
  }

  // 1. 读取配置与扫描结果
  const config = readJson<ApiGenRootConfig>(".vscode/api-gen.json");
  const apiSpecFile = readJson<ApiSpecFile>(".vscode/api-spec.json");

  // 2. 转换结构并构建系统提示词
  const genLayout = toGeneratorLayout(config);
  const systemPrompt = buildSystemPrompt(genLayout);

  // 3. 接口模块分组分析
  const moduleGroups = groupRoutesByTags(apiSpecFile.modules);

  if (moduleGroups.length === 0) {
    console.log(chalk.yellow("  接口规格文件内无有效路由分组，无需生成任何代码。"));
    return;
  }

  const commonColumns = identifyCommonColumns(genLayout.existingTables);
  const sharedInfo = buildSharedInfo(moduleGroups, commonColumns);

  console.log(
    chalk.dim(
      `  共划分 ${moduleGroups.length} 个业务模块，源自 ${apiSpecFile.modules.length} 个控制器`,
    ),
  );
  console.log(chalk.dim(`  识别到 ${commonColumns.length} 个项目通用数据表字段\n`));

  // 4. 读取 AI 服务商配置
  const aiConfig: AIConfig = config.ai ?? {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  };

  if (!aiConfig.apiKey) {
    console.error(
      chalk.red(
        "  未配置 AI 接口密钥，请在 .vscode/api-gen.json 填写 ai.apiKey，或配置环境变量 DEEPSEEK_API_KEY / OPENAI_API_KEY",
      ),
    );
    process.exit(1);
  }

  // 5. 逐模块调用 AI 生成代码
  const createdFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const group of moduleGroups) {
    console.log(chalk.cyan(`\n--- 业务模块：${group.tag} ---`));

    const specs: AIControllerSpec[] = group.routes.map((route) => ({
      moduleName: group.tag,
      endpoint: route.path,
      method: route.method.toUpperCase() as AIControllerSpec["method"],
      description: route.summary || route.description,
    }));

    const genPrompt = buildGenerationPrompt(specs, sharedInfo);
    const fullPrompt = `${systemPrompt}\n\n${genPrompt}`;

    console.log(chalk.dim(`  正在调用大模型（${aiConfig.provider} / ${aiConfig.model}）...`));

    let aiResponse: AIAdditions;
    try {
      const raw = await callAI(fullPrompt, aiConfig);
      aiResponse = JSON.parse(raw) as AIAdditions;
    } catch (err) {
      console.error(chalk.red(`  [生成失败] 模块「${group.tag}」AI 请求异常：`), err);
      continue;
    }

    if (aiResponse.schemaAdditions) {
      for (const [relPath, content] of Object.entries(aiResponse.schemaAdditions)) {
        if (!content?.trim()) continue;
        const alreadyExists = existsSync(resolve(CWD, relPath));
        writeSchemaFile(relPath, content);
        if (alreadyExists) {
          modifiedFiles.push(relPath);
          console.log(chalk.dim(`  ~ 修改数据表文件：${relPath}`));
        } else {
          createdFiles.push(relPath);
          console.log(chalk.dim(`  + 新建数据表文件：${relPath}`));
        }
      }
    }

    if (aiResponse.contractAdditions) {
      for (const [relPath, content] of Object.entries(aiResponse.contractAdditions)) {
        if (!content?.trim()) continue;
        const alreadyExists = existsSync(resolve(CWD, relPath));
        writeContractFile(relPath, content);
        if (alreadyExists) {
          modifiedFiles.push(relPath);
          console.log(chalk.dim(`  ~ 修改合约文件：${relPath}`));
        } else {
          createdFiles.push(relPath);
          console.log(chalk.dim(`  + 新建合约文件：${relPath}`));
        }
      }
    }

    if (aiResponse.summary) {
      console.log(chalk.dim(`  生成说明：${aiResponse.summary}`));
    }
  }

  const total = createdFiles.length + modifiedFiles.length;
  console.log(chalk.green(`\n=== 代码生成完成汇总（共 ${total} 个文件） ===`));

  if (createdFiles.length > 0) {
    console.log(chalk.green(`\n新建文件（${createdFiles.length}）：`));
    for (const f of createdFiles) {
      console.log(chalk.green(`  + ${f}`));
    }
  }
  if (modifiedFiles.length > 0) {
    console.log(chalk.blue(`\n修改文件（${modifiedFiles.length}）：`));
    for (const f of modifiedFiles) {
      console.log(chalk.blue(`  ~ ${f}`));
    }
  }
  if (total === 0) {
    console.log(chalk.yellow("\n  本次执行未新增或修改任何文件。"));
  }
  console.log("");
}

export default async function generate(_output: string): Promise<void> {
  await generateCommand();
}
