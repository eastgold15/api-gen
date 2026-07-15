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

  typeboxDir: string | null;
  existingSchemas: string[];
  existingContractModules: string[];
}

/** 单个业务应用 */
export interface AppLayout {
  appName: string;
  appRoot: string;
  controllersDir: string | null;
  serviceDir: string | null;
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
}