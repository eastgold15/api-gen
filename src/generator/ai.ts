import { setTimeout as sleep } from "node:timers/promises";
import type { AIConfig } from "../types/api-gen.json.js";

export type { AIConfig };

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------



export interface ProjectLayout {
  /** 相对路径 => 关键结构文件代码片段 */
  projectStructure: Record<string, string>;
  /** 数据库表定义（Drizzle Schema 代码片段） */
  existingTables: string[];
  /** 接口合约文件代码片段 */
  existingContracts: string[];
  /** 从项目中提取的命名规范 */
  namingConventions: NamingConventions;
  /** 项目目录结构树（AI 可视化项目布局） */
  structureTree?: string;
}

export interface NamingConventions {
  tableNaming: string;
  columnNaming: string;
  routeNaming: string;
  fileNaming: string;
  additional?: string[];
}

export interface ControllerSpec {
  moduleName: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  description: string;
  requestType?: string;
  responseType?: string;
}

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

const PROVIDER_DEFAULTS: Record<AIConfig["provider"], { baseUrl: string }> = {
  deepseek: { baseUrl: "https://api.deepseek.com/v1/chat/completions" },
  openai: { baseUrl: "https://api.openai.com/v1/chat/completions" },
};

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1_000;
const REQUEST_TIMEOUT_MS = 120_000;

// ---------------------------------------------------------------------------
// 限流/临时异常重试工具函数
// ---------------------------------------------------------------------------

function isRetryable(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  attempt = 1,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;

    // 不可重试的 HTTP 错误直接抛出
    if (err instanceof ApiError && !isRetryable(err.status)) throw err;

    const delay = INITIAL_RETRY_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `[api-gen] AI 接口调用失败（第 ${attempt}/${MAX_RETRIES} 次），${delay}ms 后重试...`,
    );
    await sleep(delay);
    return retryWithBackoff(fn, attempt + 1);
  }
}

// ---------------------------------------------------------------------------
// 自定义接口异常类
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ---------------------------------------------------------------------------
// AI 请求入口函数 callAI
// ---------------------------------------------------------------------------

/**
 * 调用兼容 OpenAI 格式的对话补全接口（DeepSeek、OpenAI 等）
 * 返回模型生成的纯文本内容
 *
 * 请求强制使用 JSON 返回格式，因此模型必须输出合法 JSON
 */
export async function callAI(prompt: string, config: AIConfig): Promise<string> {
  let baseUrl =
    config.baseUrl?.replace(/\/+$/, "") ??
    PROVIDER_DEFAULTS[config.provider].baseUrl;
  // 路径缺失 /chat/completions 则自动拼接标准后缀
  if (!baseUrl.endsWith("/chat/completions")) {
    baseUrl += "/v1/chat/completions";
  }

  const systemPrompt =
    "你是资深 TypeScript 后端工程师。仅返回合法 JSON。" +
    "禁止用 markdown 代码块包裹 JSON，禁止在 JSON 外附带任何解释文字。";

  const body = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" } as const,
  };

  const execute = async (): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new ApiError(
          response.status,
          `AI 接口请求异常 ${response.status}: ${response.statusText}${errorBody ? ` — 详情：${errorBody}` : ""}`,
          errorBody,
        );
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("AI 返回数据缺失 choices[0].message.content 字段");
      }

      return content;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (controller.signal.aborted) {
        throw new Error(`AI 请求超时，限制时长 ${REQUEST_TIMEOUT_MS} 毫秒`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  return retryWithBackoff(execute);
}

// ---------------------------------------------------------------------------
// 构建系统提示词 buildSystemPrompt
// ---------------------------------------------------------------------------

/**
 * 根据项目结构信息生成系统提示词
 *
 * 提示词会告知 AI 当前项目目录结构、已有数据表/接口合约、代码命名规范，
 * 保证生成代码和现有项目风格统一
 */
export function buildSystemPrompt(layout: ProjectLayout): string {
  const lines: string[] = [];

  lines.push("# 项目上下文信息");
  lines.push("");
  lines.push("你正在为下方项目生成后端代码。\n");

  // -- 项目文件结构 ------------------------------------------------
  if (Object.keys(layout.projectStructure).length > 0) {
    lines.push("## 项目核心文件结构");
    lines.push("");
    for (const [relPath, snippet] of Object.entries(layout.projectStructure)) {
      lines.push(`### ${relPath}`);
      lines.push("```");
      lines.push(snippet);
      lines.push("```");
      lines.push("");
    }
  }

  // -- 项目目录结构树 ------------------------------------------------
  if (layout.structureTree) {
    lines.push("## 项目目录结构");
    lines.push("");
    lines.push("```");
    lines.push(layout.structureTree);
    lines.push("```");
    lines.push("");
    lines.push("以上是项目的完整目录结构树，注意各层文件的分层后缀（.schema.ts / .contract.ts / .controller.ts / .service.ts / .relation.ts），生成新文件时严格遵循此结构。");
    lines.push("");
  }

  // -- 已有数据表 --------------------------------------------------
  if (layout.existingTables.length > 0) {
    lines.push("## 现有数据库表（Drizzle Schema）");
    lines.push("");
    for (const tbl of layout.existingTables) {
      lines.push("```ts");
      lines.push(tbl);
      lines.push("```");
      lines.push("");
    }
  }

  // -- 已有接口合约 -----------------------------------------------
  if (layout.existingContracts.length > 0) {
    lines.push("## 现有接口 TypeBox 合约");
    lines.push("");
    for (const c of layout.existingContracts) {
      lines.push("```ts");
      lines.push(c);
      lines.push("```");
      lines.push("");
    }
  }

  // -- 命名规范 ---------------------------------------------------
  lines.push("## 项目统一命名规范");
  lines.push("");
  lines.push(`- 数据表命名：   ${layout.namingConventions.tableNaming}`);
  lines.push(`- 字段命名：     ${layout.namingConventions.columnNaming}`);
  lines.push(`- 路由路径命名： ${layout.namingConventions.routeNaming}`);
  lines.push(`- 文件命名：     ${layout.namingConventions.fileNaming}`);
  if (layout.namingConventions.additional?.length) {
    for (const rule of layout.namingConventions.additional) {
      lines.push(`- ${rule}`);
    }
  }
  lines.push("");

  // -- 输出强制规则 ------------------------------------------------
  lines.push("## 输出要求");
  lines.push("");
  lines.push("1. 仅返回合法 JSON，禁止代码块包裹、禁止额外说明文字。");
  lines.push("2. 严格遵循项目现有命名规范。");
  lines.push("3. 尽可能复用已有数据表与合约，禁止重复定义。");
  lines.push("4. 数据表使用 Drizzle ORM 标准写法（pgTable、uuid、text、timestamp 等）。");
  lines.push("5. 接口合约使用项目统一 TypeBox 模板格式。");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 构建生成请求提示词 buildGenerationPrompt
// ---------------------------------------------------------------------------

/**
 * 根据接口路由列表与项目上下文生成用户侧生成提示词
 *
 * 告知 AI 需要产出内容：
 *   - 新增/修改 Drizzle 数据表定义
 *   - TypeBox 接口合约文件
 */
export function buildGenerationPrompt(
  specs: ControllerSpec[],
  sharedInfo: string,
): string {
  const lines: string[] = [];

  lines.push("# 代码生成需求");
  lines.push("");
  lines.push("为下方接口路由生成配套数据表与 TypeBox 合约文件。\n");

  // -- 公共分析上下文 --------------------------------------------------
  if (sharedInfo.trim()) {
    lines.push("## 项目公共分析信息");
    lines.push("");
    lines.push(sharedInfo.trim());
    lines.push("");
  }

  // -- 接口清单 --------------------------------------------------------
  lines.push("## 接口规格清单");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(specs, null, 2));
  lines.push("```");
  lines.push("");

  // -- 预期返回格式 ----------------------------------------
  lines.push("## 输出 JSON 结构规范");
  lines.push("");
  lines.push("返回 JSON 对象，所有字段可选，仅输出本次需要新增/修改的内容。");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        schemaAdditions: {
          "tables/example.table.ts": "// Drizzle pgTable 表定义代码 ...",
        },
        contractAdditions: {
          "modules/example.contract.ts": "// TypeBox 接口合约代码 ...",
        },
        summary: "生成内容简要说明",
      },
      null,
      2,
    ),
  );
  lines.push("```");
  lines.push("");
  lines.push("### 字段说明");
  lines.push("");
  lines.push("- `schemaAdditions`：文件相对路径 => 文件内容，存放新增/修改的数据表定义。");
  lines.push("- `contractAdditions`：文件相对路径 => 文件内容，存放新增/修改的 TypeBox 接口合约。");
  lines.push("- `summary`：一段文字说明本次生成的内容与设计思路。");
  lines.push("");
  lines.push("## 硬性约束");
  lines.push("");
  lines.push("1. 所有数据表必须设置主键（uuid / serial 自增）。");
  lines.push("2. 每张表强制包含 createdAt、updatedAt 时间戳字段。");
  lines.push("3. 外键关联必须匹配上文已存在的数据表。");
  lines.push("4. 合约文件统一模板：包含 Response、Create、Update、Patch、ListQuery、ListResponse 类型。");
  lines.push("5. 仅返回纯 JSON，禁止 markdown、额外注释、解释文本。");

  return lines.join("\n");
}