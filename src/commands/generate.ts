#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { loadLayout } from "../structure/detector.js";
import {
  callAI,
  buildSystemPrompt,
  buildGenerationPrompt,
  type AIConfig,
  type ProjectLayout as GeneratorLayout,
  type ControllerSpec as AIControllerSpec,
} from "../generator/ai.js";

// ---------------------------------------------------------------------------
// 本地配置/规格文件类型定义
// ---------------------------------------------------------------------------

interface ApiGenConfig {
  /** 项目结构配置 JSON 相对路径（基于执行目录） */
  layoutFile?: string;
  /** AI 大模型服务商配置 */
  ai?: AIConfig;
}

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
  /** 主标签名称，作为模块分组名 */
  tag: string;
  /** 归属该标签的全部路由 */
  routes: RouteSpec[];
  /** 包含该分组路由的控制器文件名 */
  controllerNames: string[];
}

// ---------------------------------------------------------------------------
// 工具辅助函数
// ---------------------------------------------------------------------------

const CWD = process.cwd();

function readJson<T>(filePath: string): T {
  const fullPath = path.resolve(CWD, filePath);
  const raw = fs.readFileSync(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

/**
 * 将 detector 输出的磁盘路径结构 ProjectLayout
 * 转换为 ai 生成器所需、携带文件片段的 GeneratorLayout
 */
function toGeneratorLayout(
  detectorLayout: import("../structure/detector.js").ProjectLayout,
): GeneratorLayout {
  const existingTables: string[] = [];
  if (detectorLayout.schemaPath) {
    try {
      const fullPath = path.resolve(CWD, detectorLayout.schemaPath);
      existingTables.push(fs.readFileSync(fullPath, "utf-8"));
    } catch {
      console.warn(
        chalk.yellow(
          `  [警告] 读取数据表文件失败：${detectorLayout.schemaPath}`,
        ),
      );
    }
  }

  const existingContracts: string[] = [];
  if (detectorLayout.typeboxDir) {
    const fullDir = path.resolve(CWD, detectorLayout.typeboxDir);
    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".contract.ts")) {
          existingContracts.push(
            fs.readFileSync(path.join(fullDir, entry.name), "utf-8"),
          );
        }
      }
    } catch {
      console.warn(
        chalk.yellow(
          `  [警告] 读取合约目录失败：${detectorLayout.typeboxDir}`,
        ),
      );
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
  };
}

/**
 * 扁平化所有控制器路由，按 OpenAPI 标签分组
 * 单路由多标签会同时归入多个分组
 */
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

/**
 * 遍历现有数据表片段，提取项目通用模板字段
 */
function identifyCommonColumns(schemaSnippets: string[]): string[] {
  // 项目约定内置通用字段
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

  // 在 40% 以上表出现则判定为通用字段
  const threshold = Math.max(1, Math.floor(schemaSnippets.length * 0.4));
  return knownColumns.filter((col) => countOccurrences(col) >= threshold);
}

/**
 * 组装模块分组与通用字段说明，作为 AI 提示词的共享上下文
 */
function buildSharedInfo(
  moduleGroups: ModuleGroup[],
  commonColumns: string[],
): string {
  const lines: string[] = [];

  lines.push("### 接口模块分组信息");
  lines.push("");
  lines.push(
    "所有接口已根据 OpenAPI 标签分为如下业务模块：",
  );
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
    lines.push(
      "以下字段在绝大多数表中存在，新建数据表必须统一包含：",
    );
    for (const col of commonColumns) {
      lines.push(`  - \`${col}\``);
    }
  } else {
    lines.push("未检测到项目通用模板字段。");
  }
  lines.push("");

  return lines.join("\n");
}

/**
 * 写入数据表定义文件
 * 文件已存在则追加内容（多表合并至同一 schema 文件）
 * 文件不存在则新建
 */
function writeSchemaFile(filePath: string, content: string): void {
  const absPath = path.resolve(CWD, filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  if (fs.existsSync(absPath)) {
    fs.appendFileSync(absPath, `\n${content.trim()}\n`, "utf-8");
  } else {
    fs.writeFileSync(absPath, `${content.trim()}\n`, "utf-8");
  }
}

/**
 * 写入 TypeBox 合约文件
 * 合约文件为独立单文件，存在则直接覆盖重写
 */
function writeContractFile(filePath: string, content: string): void {
  const absPath = path.resolve(CWD, filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, `${content.trim()}\n`, "utf-8");
}

/**
 * 校验前置配置文件是否存在，缺失则返回错误文本
 */
function validateEnvironment(): string | null {
  const genPath = path.resolve(CWD, ".vscode/api-gen.json");
  const specPath = path.resolve(CWD, ".vscode/api-spec.json");

  if (!fs.existsSync(genPath)) {
    return `缺少配置文件 .vscode/api-gen.json，请先执行 api-gen init`;
  }
  if (!fs.existsSync(specPath)) {
    return `缺少接口扫描文件 .vscode/api-spec.json，请先执行 api-gen scan`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// generate 主生成命令
// ---------------------------------------------------------------------------

export async function generateCommand(): Promise<void> {
  console.log(chalk.blue("正在执行 api-gen 代码生成...\n"));

  // 前置校验
  const validationError = validateEnvironment();
  if (validationError) {
    console.error(chalk.red(validationError));
    process.exit(1);
  }

  // 1. 读取 .vscode 下配置与扫描结果
  const apiGenConfig = readJson<ApiGenConfig>(".vscode/api-gen.json");
  const apiSpecFile = readJson<ApiSpecFile>(".vscode/api-spec.json");

  // 2. 加载项目目录结构
  let layout: import("../structure/detector.js").ProjectLayout;
  if (apiGenConfig.layoutFile) {
    layout = loadLayout(apiGenConfig.layoutFile);
    console.log(chalk.dim(`  从自定义路径加载项目结构：${apiGenConfig.layoutFile}`));
  } else {
    const { detectLayout } = await import("../structure/detector.js");
    layout = detectLayout(CWD);
    console.log(chalk.dim(`  自动检测当前项目：${layout.projectName}`));
  }

  // 3. 转换结构并构建系统提示词
  const genLayout = toGeneratorLayout(layout);
  const systemPrompt = buildSystemPrompt(genLayout);

  // 4. 接口模块分组分析 ----------------------------------------------------
  const moduleGroups = groupRoutesByTags(apiSpecFile.modules);

  if (moduleGroups.length === 0) {
    console.log(
      chalk.yellow(
        "  接口规格文件内无有效路由分组，无需生成任何代码。",
      ),
    );
    return;
  }

  const commonColumns = identifyCommonColumns(genLayout.existingTables);
  const sharedInfo = buildSharedInfo(moduleGroups, commonColumns);

  console.log(
    chalk.dim(
      `  共划分 ${moduleGroups.length} 个业务模块，源自 ${apiSpecFile.modules.length} 个控制器`,
    ),
  );
  console.log(
    chalk.dim(
      `  识别到 ${commonColumns.length} 个项目通用数据表字段\n`,
    ),
  );

  // 5. 读取 AI 服务商配置 --------------------------------------------------
  const aiConfig: AIConfig = apiGenConfig.ai ?? {
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

  // 6. 逐模块调用 AI 生成代码 -------------------------------------
  const createdFiles: string[] = [];
  const modifiedFiles: string[] = [];

  for (const group of moduleGroups) {
    console.log(chalk.cyan(`\n--- 业务模块：${group.tag} ---`));

    // 转换路由格式为 AI 生成器需要的规格结构
    const specs: AIControllerSpec[] = group.routes.map((route) => ({
      moduleName: group.tag,
      endpoint: route.path,
      method: route.method.toUpperCase() as AIControllerSpec["method"],
      description: route.summary || route.description,
    }));

    // 组装生成请求提示词
    const genPrompt = buildGenerationPrompt(specs, sharedInfo);
    const fullPrompt = `${systemPrompt}\n\n${genPrompt}`;

    // 请求 AI 接口
    console.log(
      chalk.dim(
        `  正在调用大模型（${aiConfig.provider} / ${aiConfig.model}）...`,
      ),
    );

    let aiResponse: AIAdditions;
    try {
      const raw = await callAI(fullPrompt, aiConfig);
      aiResponse = JSON.parse(raw) as AIAdditions;
    } catch (err) {
      console.error(
        chalk.red(`  [生成失败] 模块「${group.tag}」AI 请求异常：`),
        err,
      );
      continue;
    }

    // 写入数据表文件
    if (aiResponse.schemaAdditions) {
      for (const [relPath, content] of Object.entries(
        aiResponse.schemaAdditions,
      )) {
        if (!content?.trim()) continue;
        const alreadyExists = fs.existsSync(path.resolve(CWD, relPath));
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

    // 写入 TypeBox 合约文件
    if (aiResponse.contractAdditions) {
      for (const [relPath, content] of Object.entries(
        aiResponse.contractAdditions,
      )) {
        if (!content?.trim()) continue;
        const alreadyExists = fs.existsSync(path.resolve(CWD, relPath));
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

  // 7. 生成完成汇总输出 ------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 默认导出（适配入口 index.ts 动态导入）
// ---------------------------------------------------------------------------

export default async function generate(_output: string): Promise<void> {
  await generateCommand();
}