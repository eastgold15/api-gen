import { ensureDirSync } from "@visulima/fs";
import { pail } from "@visulima/pail";
import { dirname, resolve } from "@visulima/path";
import { existsSync, writeFileSync } from "node:fs";
import type { ApiConfig } from "../types/api-gen.json.js";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const CWD = process.cwd();
const CONFIG_PATH = resolve(CWD, ".vscode/api-config.json");

const DEFAULT_CONFIG: ApiConfig = {
  ai: {
    provider: "deepseek",
    model: "deepseek-chat",
    apiKey: "请替换为你的API密钥",
    baseUrl: "https://api.deepseek.com",
  },
  exportIndex: {
    includes: ["utils"],
  },
};

// ---------------------------------------------------------------------------
// init 主命令逻辑（生成 api-config.json，CLI 脚本配置）
// ---------------------------------------------------------------------------

export async function initCommand(): Promise<void> {
  if (existsSync(CONFIG_PATH)) {
    pail.warn(`api-config.json 已存在，跳过：${CONFIG_PATH}`);
    pail.info("如需重新生成，请先删除该文件后重试");
    return;
  }

  ensureDirSync(dirname(CONFIG_PATH));
  writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");

  pail.success(`CLI 脚本配置已保存至 ${CONFIG_PATH}`);
  pail.info("请编辑 ai.apiKey 后使用，然后运行 `api-gen sync` 填充 barrel 导出路径");
}

export default initCommand;
