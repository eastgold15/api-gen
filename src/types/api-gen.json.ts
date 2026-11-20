export interface AIConfig {
  provider: "deepseek" | "openai";
  model: string;
  apiKey: string;
  baseUrl?: string;
}

// ---------------------------------------------------------------------------
// App 分类(detector 自动识别为默认值,用户在 info 交互确认时可覆盖)
// ---------------------------------------------------------------------------

/**
 * App 分类 — 决定 link 聚合入口、generate:hook 目标。
 *
 * - `b2b-api`  : Elysia 后台 API,业务 modules 在 apps/<name>/src/modules/
 * - `web`      : Next + Elysia 用户站,业务 modules 在 apps/<name>/src/server/modules/
 * - `b2b-admin`: Next 后台管理前端,无业务 modules,只调 b2b-api,自带 hooks/api
 * - `frontend` : 其它纯前端,有 hooks/api 但非标准 Next 套件
 */
export type AppType = "b2b-api" | "web" | "b2b-admin" | "frontend";

/** 全局公共层(单仓库、多仓库通用) */
export interface CommonLayout {
  rootDir: string | null;
  /** drizzle 表定义文件: packages/database/src/drizzle/*.dbschema.ts */
  dbschemaFiles: string[];
  /** zod 契约文件: packages/shared-types/src/zschema/*.zschema.ts */
  zschemaFiles: string[];
  /** drizzle 关系定义文件: *.relation.ts */
  relationFiles: string[];
  /** 复杂查询隔离文件: *.repos.ts(可选) */
  reposFiles: string[];
  /** zschema 根目录,通常是 packages/shared-types/src/zschema */
  zschemaRoot: string | null;
  /** raw 基础字段目录,通常是 packages/database/src/zschema/raw
   *  raw 命令把 *.dbschema.ts 派生成这里 */
  zschemaRawDir: string | null;
  /** app 级 model.ts 里 import raw 的说明符,例如 "@workspace/database/zschema"。
   *  探测不到(单包布局 / 包未导出 ./zschema)时为 null,生成器回退到相对路径 */
  rawImportPath: string | null;
  /** app 级 model.ts 里 import 信封/工具的说明符,例如 "@workspace/shared-types/utils" */
  sharedTypesUtilsImport: string | null;
  existingSchemas: string[];
  existingContractModules: string[];
}

/** 单个业务应用 */
export interface AppLayout {
  appName: string;
  /** 自动识别默认值,info 交互时可改 */
  appType: AppType;
  /** apps/<name> 根目录(不含 src/) */
  appRoot: string;
  /** 业务 modules 根目录。
   *  - b2b-api: apps/<name>/src/modules
   *  - web:     apps/<name>/src/server/modules
   *  - b2b-admin / frontend: null */
  modulesDir: string | null;
  /** 聚合入口文件绝对路径(link 写入目标):
   *  - b2b-api: apps/<name>/src/modules/index.ts(applyAllModules)
   *  - web:     apps/<name>/src/server/index.ts(applyAllControllers)
   *  - b2b-admin / frontend: null */
  aggregateIndex: string | null;
  /** app 自己引用 modules 的 import 前缀:"~/modules" 或 null */
  importAlias: string | null;
  /** 旧消费方字段,统一指向 modulesDir;新代码请用 modulesDir */
  controllersDir: string | null;
  /** service 与 controller 同目录,本字段保留为 null */
  serviceDir: string | null;
  /** HTTP 契约层文件: <modulesDir>/<domain>/<domain>.model.ts */
  modelFiles: string[];
  /** 已有 HTTP 契约的 domain(kebab 名),与 controller 一一对应 */
  modelModules: string[];
}

/**
 * 前端 hook 生成配置
 *
 * 新架构下 hook 的类型**全部从 Eden 推导**,不手写响应类型、不用 `as unknown as` cast、
 * query 参数平铺(不包 `{ query: ... }`)。这里只配置"封装 hook 从哪来"。
 */
export interface HookConfig {
  /** 剥壳封装 hook 的 import 路径,例如 "@workspace/ui/hooks"。
   *  留空 = 不剥壳,直接用 @tanstack/react-query 的 useQuery / useMutation */
  apiHooksImport?: string;
  /** Eden client 的 import 路径,例如 "@/lib/rpc" */
  rpcImport?: string;
  /** 列表/详情的 staleTime(毫秒) */
  staleTime?: number;
}

// ---------------------------------------------------------------------------
// 桶导出(barrel)配置
// ---------------------------------------------------------------------------

/**
 * 桶导出(barrel)配置
 *
 * 示例:
 * ```json
 * {
 *   "includes": ["utils", "constants/definitions"],
 *   "utils": ["packages/shared-types/src/utils"],
 *   "constants/definitions": []
 * }
 * ```
 *
 * - `includes`: 要处理的组名清单
 * - 其余 key: 组名 → 路径数组(空数组表示留用待填,barrel 时自动递归展开)
 * - key 含 `/` 或以 `.` 开头时视为路径形式组,空数组自动展开
 */
export type ExportIndexConfig = Record<string, string[]>;

// ---------------------------------------------------------------------------
// 管道工作流步骤
// ---------------------------------------------------------------------------

/** 选取文件步骤 */
export interface SelectStep {
  type: "select";
  /** fast-glob 语法,相对于项目根目录 */
  glob: string;
}

/** 文件头部插入内容步骤 */
export interface PrependStep {
  type: "prepend";
  /** 要插入的内容(含换行符由函数处理) */
  content: string;
}

/** 所有支持的步骤类型 */
export type Step = SelectStep | PrependStep;

/** 一条管道:步骤顺序执行,select 替换当前文件集,其他步骤消费当前文件集 */
export type Pipeline = Step[];

/** CLI 脚本配置(api-config.json) */
export interface ApiConfig {
  ai: AIConfig;
  exportIndex: ExportIndexConfig;
  /** 可选的工作流管道配置 */
  pipelines?: Pipeline[];
  /** Eden Treaty 路径前缀(同 ApiGenRootConfig.edenPrefix)。
   *  缺省空串 = 直接挂载,无版本号。
   *  示例:"api" (prefix: "/api") / "api.v1" (prefix: "/api/v1") */
  edenPrefix?: string;
  /** 前端 hook 生成配置(gen-hook 用) */
  hooks?: HookConfig;
}

/** hook 配置默认值(生成器与 init 共用) */
export const DEFAULT_HOOK_CONFIG: Required<HookConfig> = {
  apiHooksImport: "@workspace/ui/hooks",
  rpcImport: "@/lib/rpc",
  staleTime: 5 * 60 * 1000,
};

/** 全局根配置:给 AI 看的项目结构(api-gen.json) */
export interface ApiGenRootConfig {
  projectName: string;
  /** 仅展示标记,业务逻辑不做分支判断 */
  isMonorepo: boolean;
  /** AI专用终端tree纯文本 */
  structureTree: string;
  common: CommonLayout | null;
  apps: AppLayout[];
  /** Eden Treaty 路径前缀,用于 generate:hook 拼装 eden 访问链。
   *  - 默认 "" (直接挂载,无版本号)
   *  - 单挂载点 "api" (server.ts: new Elysia({ prefix: "/api" }))
   *  - 多版本 "api.v1" / "api.v2" 等
   *  注意:b2b-api 端 Elysia 的 prefix 决定此值,user 须保持一致 */
  edenPrefix?: string;
}
