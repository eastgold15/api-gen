# @visulima/pail 完整使用指南（适配你的 api-gen CLI 项目）
## 一、基础引入方式
两种导入：全局默认单例 `pail` / 自定义创建 `createPail`
```typescript
// 全局单例（推荐业务直接用，开箱即用）
import { pail } from "@visulima/pail";

// 自定义实例（多场景隔离、自定义样式/日志级别用）
import { createPail } from "@visulima/pail";
```

## 二、基础日志等级（替换你所有 console.log）
完全对应 RFC5424 标准，和 Cerebro 的 `--verbose/--quiet/--debug` 自动联动
```typescript
// 普通信息（替代 console.log）
pail.info("扫描目录完成");

// 调试详情（--verbose 才打印）
pail.verbose("读取 tsconfig 路径：xxx");

// 警告（黄色）
pail.warn("未检测到 tsconfig.json，使用默认配置");

// 错误（红色）
pail.error("文件写入失败");

// 成功提示（绿色带对勾）
pail.success("配置已保存至 .vscode/api-gen.json");

// 强制输出，无视当前日志级别
pail.force.info("重要提示，无论日志等级都会显示");
```

## 三、自带特色快捷打印（CLI 交互专用）
```typescript
// 加载中等待提示（交互式动态行）
pail.pending("正在解析项目结构...");

// 任务完成带前后缀
pail.complete({
  prefix: "[api-gen]",
  message: "扫描完成",
  suffix: "monorepo"
});

// 观察/监听提示
pail.watch("监听 schema 文件变更");

// 致命错误
pail.fatal(new Error("无法读取目录权限"));
```

## 四、结合 boxen 边框面板（你代码里已有 boxen）
完美适配你结尾输出模块摘要的逻辑，无需改边框代码
```typescript
import { boxen } from "@visulima/boxen";
import { pail } from "@visulima/pail";

const summaryText = boxen(`· 公共层 3张表\n· 2个应用`, {
  headerText: "检测到项目模块",
  borderStyle: "round"
});

pail.info(summaryText);
```

## 五、作用域日志（scope，区分不同命令打印）
多命令隔离日志，打印自动带上标识，方便区分是 init / generate 命令输出
```typescript
// 创建全局作用域
const cliLogger = pail.scope("api-gen");
cliLogger.info("init 命令启动");

// 子作用域，嵌套标识
const scanLogger = cliLogger.scope("scan-layout");
scanLogger.verbose("遍历目录文件");
```

## 六、自定义日志实例（高级配置）
### 1. 自定义日志级别、交互式、自定义打印类型
```typescript
import { createPail } from "@visulima/pail";

const logger = createPail({
  // 默认日志等级，Cerebro 会自动覆盖用户传入的 --quiet/--debug
  logLevel: "info",
  // 交互式终端（动态进度/loading 行）
  interactive: true,
  // 自定义打印类型
  types: {
    api: {
      badge: "🌐",
      color: "cyan",
      label: "API 生成",
      logLevel: "info"
    }
  }
});

logger.api("生成用户接口类型");
```

### 2. 子日志实例（继承父配置，局部覆盖）
```typescript
const rootLogger = createPail({ logLevel: "info" });
// 子日志，继承全部配置，仅修改日志等级
const debugLogger = rootLogger.child({ logLevel: "debug" });
```

## 七、计时器（统计文件生成耗时）
适合统计扫描、代码生成耗时，替代手动 Date 计算
```typescript
pail.time("scan-project");
// 执行扫描逻辑
await detectLayout(cwd);
// 打印耗时并结束计时
pail.timeEnd("scan-project");
```

## 八、交互式进度条/加载动画（CLI 生成文件时用）
### 1. 普通进度条
```typescript
const logger = createPail({ interactive: true });
const bar = logger.createProgressBar({
  total: 20,
  format: "生成接口文件 [{bar}] {percentage}%"
});

bar.start();
bar.update(10); // 更新到50%
bar.stop();
```
### 2. 加载旋转动画
```typescript
const spinner = logger.createSpinner({ text: "AI 生成类型代码中..." });
spinner.start();
// AI 请求逻辑
spinner.succeed("生成完成");
```

## 九、结构化对象树打印（调试 config 对象）
替代手动循环打印配置，自动生成树形结构
```typescript
import { renderObjectTree } from "@visulima/pail/object-tree";

const config = detectLayout(cwd);
pail.verbose(renderObjectTree(config));
```

## 十、宽事件 WideEvent（一次汇总整条操作日志，适合完整 init 流程）
扫描→保存模板→生成配置 全流程日志统一汇总输出一条结构化日志
```typescript
import { createWideEvent } from "@visulima/pail/wide-event";

const ev = createWideEvent({ pail, name: "api-gen.init" });

ev.set({ projectName: config.projectName });
ev.info("扫描目录完成");
ev.info("写入 .vscode/api-gen.json");
// 全部操作结束，统一输出完整事件日志
ev.finish({ status: "success" });
```

## 十一、日志启停控制
```typescript
// 关闭所有打印（CI/脚本静默模式）
pail.disable();
// 恢复打印
pail.enable();

// 暂停缓存日志，resume 统一输出
pail.pause();
pail.info("缓存消息");
pail.resume(); // 批量打出
```

## 十二、结合你现有 initCommand 完整改造示例片段
```typescript
import { pail } from "@visulima/pail";
import { boxen } from "@visulima/boxen";

export async function initCommand(directory?: string): Promise<void> {
  const cwd = directory ? resolve(directory) : process.cwd();
  pail.verbose(`正在扫描目录：${cwd}`);

  const config = detectLayout(cwd);

  // 打印项目结构
  printLayout(config);

  const confirmed = await askConfirm("是否保存配置文件？");
  if (!confirmed) {
    pail.warn("操作已取消");
    return;
  }

  // 文件写入逻辑
  writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  pail.success(`配置已保存：${configPath}`);

  // 底部面板摘要
  const panel = boxen(summary.join("\n"), { headerText: "检测到项目模块" });
  pail.info(panel);
}
```

## 十三、和 Cerebro CLI 联动关键优势
1. Cerebro 内置识别 `--quiet` / `-v/--verbose` / `--debug` 参数，自动修改 pail 日志等级，无需自己写判断；
2. 统一输出流，搭配 `errorHandlerPlugin` 统一格式化所有报错；
3. 全 visulima 生态，colorize / boxen / pail 互相兼容，无第三方日志包；
4. 支持 JSON 格式化输出，方便CI流水线收集日志。