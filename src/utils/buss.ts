import { parseSingleTsFile, scanTsFilesRecursive } from "./ast-scanner";

// 只获取controller文件
const controllerPaths = scanTsFilesRecursive(process.cwd()).filter(p => p.endsWith(".controller.ts"));
for (const file of controllerPaths) {
  const { program } = parseSingleTsFile(file);
  // 提取Elysia路由逻辑
}