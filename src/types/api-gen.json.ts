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

/** CLI 脚本配置（api-config.json） */
export interface ApiConfig {
  ai: AIConfig;
  exportIndex: ExportIndexConfig;
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
