import { ensureDirSync } from "@visulima/fs";
import { pail } from "@visulima/pail";
import { dirname, resolve } from "@visulima/path";
import { existsSync, writeFileSync } from "node:fs";
import type { ApiConfig } from "../types/api-gen.json.js";

const DEFAULT_CONFIG: ApiConfig = {
  ai: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "请替换为你的API密钥",
    baseUrl: "https://api.deepseek.com",
  },
  exportIndex: {
    // includes 三组:
    //  - utils: 工具函数桶
    //  - drizzle: dbschema 桶(raw 文件统一从这里 import,先 barrel 再 raw)
    //  - constants/definitions: 3 层常量字典(路径形式组,空数组自动展开)
    includes: [
      "utils",
      "packages/contract/src/drizzle",
      "packages/contract/src/utils/constants/definitions",
    ],
    "packages/contract/src/utils/constants/definitions": [],
  },
  pipelines: [
    [
      { type: "select", glob: "**/*.tbschema.ts" },
      { type: "prepend", content: "/** biome-ignore-all lint/style/useNamingConvention: 契约文件固定约束 */" },
    ],
  ],
};

// ---------------------------------------------------------------------------
// init 主命令逻辑（生成 api-config.json，CLI 脚本配置）
// ---------------------------------------------------------------------------

export async function initCommand(): Promise<void> {
  const configPath = resolve(process.cwd(), ".vscode/api-config.json");

  if (existsSync(configPath)) {
    pail.warn(`api-config.json 已存在，跳过：${configPath}`);
    pail.info("如需重新生成，请先删除该文件后重试");
    return;
  }

  ensureDirSync(dirname(configPath));
  writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");

  pail.success(`CLI 脚本配置已保存至 ${configPath}`);
  pail.info("请编辑 ai.apiKey 后使用，然后运行 `api-gen info` 探测项目结构");
  pail.info("接着 `api-gen sync` 填充 barrel 导出路径(utils + constants/definitions)");
}

export default initCommand;
