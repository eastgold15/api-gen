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
    // 对库(package 源码根),includes 填一个根路径即可:
    //   sync 会自动递归扫这个目录下所有"有内容"的子目录,生成 index.ts 桶导出。
    // 多个不连续的库 → 多个根路径(每个都会被独立递归展开)。
    // 约定名组(utils/hooks/...) → 沿用"组名 + 同名目录列表"形式,本项目用不到。
    // 路径形式组(具体到子目录,如 .../constants/definitions) → 空数组 = 自动展开。
    includes: [
      "packages/contract/src",
    ],
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
  pail.info("请编辑 ai.apiKey 后使用,然后运行 `api-gen info` 探测项目结构");
  pail.info("接着 `api-gen barrel`(无需先跑 sync:includes 里的根路径会自动递归展开)");
}

export default initCommand;
