export interface AIConfig {
  provider: "deepseek" | "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

/** 全局公共层，单仓库、多仓库通用 */
export interface CommonLayout {
  rootDir: string | null;
  schemaFiles: string[];
  relationFiles: string[];
  contractFiles: string[];

  dtoDir: string | null;
  existingSchemas: string[];
  existingContractModules: string[];
}

/** 单个业务应用 */
export interface AppLayout {
  appName: string;
  appRoot: string;
  /** 后端实际代码根目录（src/ 或 server/），供 AI prompt 参考目录结构 */
  backRoot: string;
  controllersDir: string | null;
  serviceDir: string | null;
}

// ---------------------------------------------------------------------------
// 桶导出（barrel）配置
// ---------------------------------------------------------------------------

/**
 * 桶导出（barrel）配置
 *
 * 示例：
 * ```json
 * {
 *   "includes": ["utils", "hooks"],
 *   "utils": ["packages/contract/src/utils"],
 *   "hooks": []
 * }
 * ```
 *
 * - `includes`: 要处理的组名清单
 * - 其余 key: 组名 → 路径数组（空数组表示留用待填）
 */
export type ExportIndexConfig = Record<string, string[]>;

// ---------------------------------------------------------------------------
// 管道工作流步骤
// ---------------------------------------------------------------------------

/** 选取文件步骤 */
export interface SelectStep {
  type: "select";
  /** fast-glob 语法，相对于项目根目录 */
  glob: string;
}

/** 文件头部插入内容步骤 */
export interface PrependStep {
  type: "prepend";
  /** 要插入的内容（含换行符由函数处理） */
  content: string;
}

/** 所有支持的步骤类型 */
export type Step = SelectStep | PrependStep;

/** 一条管道：步骤顺序执行，select 替换当前文件集，其他步骤消费当前文件集 */
export type Pipeline = Step[];

/** CLI 脚本配置（api-config.json） */
export interface ApiConfig {
  ai: AIConfig;
  exportIndex: ExportIndexConfig;
  /** 可选的工作流管道配置 */
  pipelines?: Pipeline[];
}

/** 全局根配置：给 AI 看的项目结构（api-gen.json） */
export interface ApiGenRootConfig {
  projectName: string;
  /** 仅展示标记，业务逻辑不做分支判断 */
  isMonorepo: boolean;
  /** AI专用终端tree纯文本 */
  structureTree: string;
  common: CommonLayout | null;
  apps: AppLayout[];
}
