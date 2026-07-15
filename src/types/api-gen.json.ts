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

/** 单个导出组，如 utils / drizzle / typebox / constants */
export interface ExportGroup {
  /** 组名，如 "utils" */
  name: string;
  /** 目录路径（相对项目根） */
  rootDir: string;
}

/** 桶导出配置 */
export interface ExportIndexConfig {
  groups: ExportGroup[];
}

/** 全局根配置唯一标准 */
export interface ApiGenRootConfig {
  projectName: string;
  /** 仅展示标记，业务逻辑不做分支判断 */
  isMonorepo: boolean;
  /** AI专用终端tree纯文本 */
  structureTree: string;
  common: CommonLayout | null;
  apps: AppLayout[];
  ai: AIConfig;

  /** 桶导出（barrel）配置，可选 */
  exportIndex?: ExportIndexConfig;
}