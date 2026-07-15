# @visulima/cerebro 轻量跨运行时CLI框架完整文档
最后更新：2026年3月18日

## 一、项目简介
`@visulima/cerebro`（脑波）是一款**轻量级、高可扩展**的命令行应用开发框架，专门用于构建现代化 CLI 工具。
### 核心定位
1. **TypeScript 原生优先**：全量类型定义，开箱即用类型安全；
2. **多运行时兼容**：一套代码同时支持 Node.js / Deno / Bun；
3. **极简核心+插件化扩展**：内核零冗余依赖，所有高阶能力通过插件按需引入；
4. **企业级命令体系**：原生支持嵌套子命令、参数强校验、自动帮助文档、Shell 自动补全；
5. **极低开发成本**：仅声明命令元数据即可自动生成帮助、版本、校验逻辑，无需重复编写样板代码。

适合场景：开发脚手架、部署工具、数据库运维脚本、跨平台自动化命令行程序。

## 二、核心特性一览
### 1. 框架与架构能力
- **零依赖内核**：核心代码体积极小，仅保留命令解析、执行基础逻辑；格式化、日志、文件操作等功能全部为可选对等依赖；
- **TS First 设计**：完整泛型、类型推导，支持自定义工具箱上下文类型扩展；
- **跨运行时抽象层**：统一封装 `argv`、环境变量、工作目录、进程退出逻辑，一套代码跑通 Node/Deno/Bun；
- **标准化插件系统**：生命周期钩子、工具箱上下文扩展、插件依赖管理，灵活横向拓展功能；
- **树形命令注册表**：扁平命令、多层级嵌套子命令统一管理，支持命令别名。

### 2. 参数与命令解析能力
- **位置参数**：强类型参数定义（字符串/数字/布尔），支持必填校验；
- **命名选项（Flags）**：短别名、默认值、负向开关（`--no-xxx`）、必填项、互斥选项、隐含联动选项；
- **智能纠错**：基于莱文斯坦距离拼写纠错，输错命令自动推荐相近指令；
- **多 Shell 自动补全**：内置 bash/zsh/fish 补全生成命令，一键生成补全脚本；
- **环境变量校验**：类型化环境变量配置，支持必填、默认值，自动读取校验。

### 3. 开发者体验优化
- **全自动帮助文档**：根据命令元数据自动生成 `--help` 输出，无需手动编写文案；
- **内置版本指令**：自带 `--version` 查看工具版本；
- **README 自动生成**：基于全部命令定义一键产出项目使用文档；
- **分级日志输出**：安静/普通/冗长/调试四种日志级别自由切换；
- **标准化错误处理**：统一捕获执行、参数、环境异常，友好错误提示、规范 Unix 退出码；
- **懒加载命令**：大项目拆分命令逻辑，仅执行对应指令时才导入处理函数，降低启动耗时。

### 4. 内置开箱功能
1. 分级日志输出控制（quiet / normal / verbose / debug）
2. 类型安全环境变量读取与校验
3. 全局统一异常捕获、友好报错展示
4. 拼写错误命令智能推荐
5. 内置 Help / Version / Completion / Readme 四大基础命令

## 三、快速上手
### 3.1 安装
#### 基础安装（核心必装）
```bash
npm install @visulima/cerebro @visulima/command-line-args @visulima/error
```

#### 可选对等依赖（按需安装）
```bash
# 彩色格式化框输出
npm install @visulima/boxen
# 高级分级日志
npm install @visulima/pail
# Shell自动补全、文件路径处理
npm install @visulima/fs @visulima/path
# 自动生成README文档
npm install @visulima/readgen
```

### 3.2 导入方式
#### ESM（推荐，TS/现代Node项目）
```typescript
import { createCerebro } from "@visulima/cerebro";
```
#### CommonJS
```javascript
const { createCerebro } = require("@visulima/cerebro");
```
#### 子路径导入（内置命令、插件单独引入）
```typescript
// 内置系统命令
import { HelpCommand, VersionCommand, CompletionCommand, ReadmeCommand } from "@visulima/cerebro/command/help";

// 官方内置插件
import { errorHandlerPlugin } from "@visulima/cerebro/plugin/error-handler";
import { runtimeVersionCheckPlugin } from "@visulima/cerebro/plugin/runtime-version-check";
import { updateNotifierPlugin } from "@visulima/cerebro/plugin/update-notifier";
```

### 3.3 环境要求
- Node.js ≥ 18.x
- TypeScript ≥ 5.0（TS项目）
- 包管理器：npm / yarn / pnpm / bun

### 3.4 最小可用示例
```typescript
import { createCerebro } from "@visulima/cerebro";

// 创建CLI实例
const cli = createCerebro("test-cli");

// 注册单条命令
cli.addCommand({
  name: "hello",
  description: "输出欢迎文案",
  execute: ({ logger }) => {
    logger.log("Hello from Cerebro!");
  },
});

// 启动CLI，传入参数可直接运行测试
await cli.run(["hello"]);
```
运行输出：
```
Hello from Cerebro!
```

### 3.5 进阶基础示例
#### 1）带位置参数命令
```typescript
import { createCerebro } from "@visulima/cerebro";
const cli = createCerebro("greet-cli", {
  packageName: "greet-cli",
  packageVersion: "1.0.0",
});

cli.addCommand({
  name: "greet",
  description: "向指定人名打招呼",
  argument: {
    name: "name",
    description: "需要问候的人名",
    type: String,
    required: true
  },
  execute: ({ argument, logger }) => {
    logger.log(`Hello, ${argument[0]}!`);
  }
});

await cli.run();
```
执行命令：
```bash
node cli.js greet Alice
# 输出：Hello, Alice!
```

#### 2）带选项/短别名/默认值命令
```typescript
cli.addCommand({
  name: "greet",
  description: "向指定人名打招呼",
  argument: {
    name: "name",
    type: String,
    required: true
  },
  options: [
    {
      name: "loud",
      alias: "l",
      description: "是否大写输出",
      type: Boolean
    },
    {
      name: "times",
      alias: "t",
      description: "重复输出次数",
      type: Number,
      defaultValue: 1
    }
  ],
  execute: ({ argument, options, logger }) => {
    const msg = `Hello, ${argument[0]}!`;
    const output = options.loud ? msg.toUpperCase() : msg;
    for(let i = 0; i < options.times; i++) logger.log(output);
  }
});
```
执行命令：
```bash
node cli.js greet Alice --loud --times 3
```

#### 3）嵌套子命令（分组管理）
```typescript
cli.addCommand({
  name: "db",
  alias: "database",
  description: "数据库运维相关指令",
  commands: [
    {
      name: "migrate",
      description: "执行数据库迁移",
      execute: ({ logger }) => logger.log("执行迁移脚本...")
    },
    {
      name: "seed",
      description: "填充测试种子数据",
      execute: ({ logger }) => logger.log("导入种子数据...")
    }
  ]
});
```
执行命令：
```bash
node cli.js db migrate
node cli.js db seed
```

#### 4）环境变量校验
```typescript
cli.addCommand({
  name: "deploy",
  description: "部署应用",
  env: {
    API_KEY: {
      description: "接口鉴权密钥",
      required: true
    },
    API_URL: {
      description: "服务接口地址",
      defaultValue: "https://api.example.com"
    }
  },
  execute: ({ env, logger }) => {
    logger.log(`接口地址：${env.API_URL}`);
    logger.log(`密钥：${env.API_KEY}`);
  }
});
```

## 四、整体架构设计
### 4.1 核心组成
1. **Cerebro CLI 实例**
    CLI 程序入口，统一管理配置、插件、命令注册表、执行生命周期，可自定义日志、工作目录、启动参数。
    ```typescript
    const cli = createCerebro("my-cli", {
      packageName: "my-cli",
      packageVersion: "1.0.0",
      logger: console,
      cwd: process.cwd(),
      argv: process.argv.slice(2)
    });
    ```
2. **命令注册表**
    树形存储所有指令，支持扁平命令、嵌套分组、命令别名，负责命令检索、拼写纠错。
3. **插件系统**
    通过 `cli.use(plugin)` 注册，绑定CLI完整生命周期，可扩展全局工具箱上下文。
4. **Toolbox 工具箱（执行上下文）**
    每个命令执行时自动注入，内置基础对象，插件可自定义拓展属性：
    ```typescript
    {
      argument: string[],        // 位置参数数组
      options: Record<string, any>, // 解析完成的选项
      env: Record<string, string>, // 校验后的环境变量
      logger: Console,           // 日志实例
      cwd: string                // 当前执行目录
      // 插件自定义拓展属性
    }
    ```

### 4.2 完整执行生命周期
1. **CLI初始化**
    加载配置 → 注册内置基础命令 → 加载全部插件
2. **参数解析**
    解析主命令名 → 解析选项/标志 → 提取位置参数
3. **命令匹配**
    检索对应指令，无匹配时智能推荐相似命令，校验嵌套子命令路径合法性
4. **插件初始化**
    执行插件注册逻辑，拓展工具箱上下文，挂载生命周期钩子
5. **全局参数校验**
    必填选项检查、类型校验、互斥选项拦截、环境变量校验
6. **命令执行**
    组装工具箱上下文 → 执行命令逻辑 → 统一捕获异常 → 返回标准进程退出码

### 4.3 三大设计原则
1. **内核轻量化**
    核心仅保留命令解析与执行，所有拓展能力均为可选依赖，按需安装，减小打包体积；
2. **全链路类型安全**
    原生支持TS泛型，可全局扩展工具箱类型，自定义插件、命令均可获得完整代码提示；
3. **多层可扩展**
    - 命令扩展：新增业务指令、嵌套分组、懒加载指令；
    - 插件扩展：全局增强能力、注入通用工具；
    - 上下文扩展：自定义工具箱工具类，全命令复用。

## 五、命令系统完整详解
### 5.1 命令完整结构定义
```typescript
interface Command {
  // 基础元数据
  name: string;
  description: string;
  alias?: string;
  isDefault?: boolean; // 无输入命令时默认执行
  commandPath?: string[];

  // 参数配置（三选一，不可同时存在）
  argument?: ArgumentDef; // 位置参数
  options?: OptionDef[]; // 命名选项
  env?: EnvDef; // 环境变量

  // 执行逻辑二选一
  execute?: (toolbox) => void | Promise<void>; // 内联处理函数
  loader?: () => Promise<{ default: Function }>; // 懒加载处理函数

  // 嵌套子命令分组
  commands?: Command[];
}
```

### 5.2 选项高级能力
1. **负向开关**
    ```typescript
    {
      name: "color",
      type: Boolean,
      defaultValue: true,
      negatable: true // 支持 --no-color
    }
    ```
2. **互斥选项**
    ```typescript
    {
      name: "watch",
      type: Boolean,
      conflicts: ["ci"] // 不能与 --ci 同时使用
    }
    ```
3. **隐含联动选项**
    ```typescript
    {
      name: "production",
      type: Boolean,
      implies: { minify: true, sourcemap: false }
    }
    ```

### 5.3 懒加载命令（大项目优化）
命令元数据提前注册，执行时才动态导入处理逻辑，大幅缩短CLI启动速度：
```typescript
// 命令元数据声明
const buildCmd = {
  name: "build",
  description: "项目打包构建",
  options: [{ name: "output", alias: "o", type: String }],
  // 仅调用时加载逻辑
  loader: () => import("./build-handler")
};
// build-handler.ts
export default ({ options, logger }) => {
  logger.log(`输出目录：${options.output}`);
};
```

## 六、插件开发与使用
### 6.1 插件基础结构
插件是返回标准化插件对象的函数，支持注册钩子、拓展工具箱、声明依赖：
```typescript
import type { Plugin } from "@visulima/cerebro";

// 自定义HTTP工具插件
declare global {
  namespace Cerebro {
    interface ExtensionOverrides {
      http: {
        get: <T>(url: string) => Promise<T>;
        post: <T>(url: string, data: unknown) => Promise<T>;
      };
    }
  }
}

export const httpPlugin = (): Plugin => ({
  name: "http-plugin",
  version: "1.0.0",
  // 依赖其他插件
  dependencies: [],
  register: async ({ toolbox, logger }) => {
    logger.log("HTTP工具插件初始化完成");
    // 拓展全局工具箱
    toolbox.http = {
      get: async <T>(url: string) => {
        const res = await fetch(url);
        return res.json() as T;
      },
      post: async <T>(url: string, data: unknown) => {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        return res.json() as T;
      }
    };
  }
});
```
注册插件：
```typescript
cli.use(httpPlugin());
```

### 6.2 官方内置插件
1. **errorHandlerPlugin 全局错误处理**
    统一捕获异常、隐藏/展示堆栈、规范进程退出：
    ```typescript
    cli.use(errorHandlerPlugin({
      exitOnError: true,
      showStackTrace: false,
      logErrors: true
    }));
    ```
2. **runtimeVersionCheckPlugin 运行时版本校验**
    限制Node/Deno/Bun最低版本：
    ```typescript
    cli.use(runtimeVersionCheckPlugin({
      requiredVersion: ">=18.0.0",
      message: "请升级运行时至18版本以上"
    }));
    ```
3. **updateNotifierPlugin 更新检测**
    启动时检测npm包新版本并提示用户：
    ```typescript
    cli.use(updateNotifierPlugin({
      packageName: "my-cli",
      packageVersion: "1.0.0",
      checkInterval: 86400000 // 24小时检测一次
    }));
    ```

### 6.3 插件开发最佳实践
1. 单一职责：一个插件只实现一类功能（日志/数据库/网络）；
2. 容错初始化：插件加载失败提供降级方案，不直接崩溃整个CLI；
3. 配套类型声明：拓展工具箱时必须补充全局类型，保证TS类型安全；
4. 声明插件依赖：存在前置依赖插件时通过 `dependencies` 配置。

## 七、完整生产级CLI项目搭建流程
### 7.1 项目初始化
```bash
mkdir my-pro-cli && cd my-pro-cli
npm init -y
# 安装核心依赖
npm install @visulima/cerebro @visulima/command-line-args @visulima/error
# 安装TS开发依赖
npm install -D typescript @types/node
```

### 7.2 入口文件 `src/cli.ts`
```typescript
#!/usr/bin/env node
import { createCerebro } from "@visulima/cerebro";
import { errorHandlerPlugin, updateNotifierPlugin } from "@visulima/cerebro/plugin";
import { buildCommand } from "./commands/build";
import { deployCommand } from "./commands/deploy";

// 初始化CLI实例
const cli = createCerebro("project-cli", {
  packageName: "@company/project-cli",
  packageVersion: "2.1.0"
});

// 注册全局插件
cli.use(errorHandlerPlugin({ exitOnError: true }));
cli.use(updateNotifierPlugin({
  packageName: "@company/project-cli",
  packageVersion: "2.1.0",
  checkInterval: 86400000
}));

// 注册业务命令
cli.addCommand(buildCommand);
cli.addCommand(deployCommand);

// 启动程序
await cli.run();
```

### 7.3 拆分命令文件 `src/commands/build.ts`
```typescript
import type { Command } from "@visulima/cerebro";

export const buildCommand: Command = {
  name: "build",
  description: "项目打包构建",
  options: [
    {
      name: "output",
      alias: "o",
      type: String,
      defaultValue: "./dist",
      description: "产物输出目录"
    },
    {
      name: "production",
      alias: "p",
      type: Boolean,
      description: "生产环境打包模式"
    }
  ],
  execute: async ({ options, logger }) => {
    logger.log(`开始构建，输出目录：${options.output}`);
    logger.log(`打包模式：${options.production ? "生产" : "开发"}`);
    // 此处编写实际构建逻辑
    logger.log("构建完成！");
  }
};
```

### 7.4 打包与发布配置 `package.json`
```json
{
  "name": "@company/project-cli",
  "version": "2.1.0",
  "type": "module",
  "bin": {
    "project-cli": "./dist/cli.js"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@visulima/cerebro": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 7.5 本地测试与发布
```bash
# 编译TS
npm run build
# 本地链接全局测试
npm link
project-cli --help
# 发布至npm
npm login
npm publish
```

## 八、适用开发场景
1. **企业内部运维CLI**：部署脚本、数据库迁移、服务启停工具；
2. **前端/后端项目脚手架**：项目初始化、打包、本地开发服务命令；
3. **跨运行时通用工具**：需要同时兼容 Node / Bun / Deno 的脚本工具；
4. **npm 全局命令行工具**：可发布至npm、供用户全局安装使用；
5. **自动化批量处理工具**：文件处理、API批量请求、CI配套辅助指令；
6. **多层级复杂命令工具**：存在大量子命令、分组管理的大型CLI程序。

## 九、框架核心优势总结
1. **低学习成本**：声明式API，仅描述命令元数据自动完成校验、帮助、补全；
2. **极致轻量化**：核心无冗余依赖，按需安装功能包，打包体积小；
3. **跨运行时**：一套代码兼容 Node/Deno/Bun，无需分别适配；
4. **完善TS支持**：全链路类型推导，插件、自定义上下文完整类型提示；
5. **强拓展能力**：插件机制无侵入扩展全局能力，支持懒加载优化启动速度；
6. **生产级配套能力**：自动文档、版本检测、错误格式化、智能拼写纠错、Shell补全等开箱即用；
7. **规范易维护**：命令分层拆分、统一执行生命周期，大型CLI项目便于迭代维护。