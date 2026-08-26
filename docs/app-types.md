# 四种 AppType 形态

`ApiGenRootConfig.apps[i].appType` 是 `link` / `gen-hook` 等命令读的真值，决定了它们**生成什么 / 写到哪里**。

## b2b-api（Elysia 后台 API）

```
apps/b2b-api/
├── src/
│   ├── core/                   # 基础设施(db / auth / 错误)
│   └── modules/
│       ├── health/             # 单独 export
│       ├── site/
│       │   ├── site.controller.ts
│       │   └── site.service.ts
│       └── customer/
│           ├── customer.controller.ts
│           └── customer.service.ts
```

- **modulesDir**：`src/modules`
- **aggregateIndex**：`src/modules/index.ts`
- **link** 输出：`applyAllModules(app)`，import 前缀 `.`（聚合文件与 modules 同级）
- **health** 单独 export，其他 controller 在函数体里 `.use()` 进来
- **gen-hook 源**：所有 controller 路由作为 hook 模板
- **drizzle 数据库访问**：controller 用 `db` 插件 → service → repos → drizzle

## web（Next + Elysia 用户站）

```
apps/web/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/
│   ├── lib/                    # rpc.ts: useEden / eden
│   └── server/
│       ├── core/
│       ├── index.ts            # 聚合入口(由 link 生成)
│       └── modules/
│           ├── hero-card/
│           └── site-product/
```

- **modulesDir**：`src/server/modules`
- **aggregateIndex**：`src/server/index.ts`
- **link** 输出：`applyAllControllers(app)`，import 前缀 `./modules`（聚合在 `src/server/index.ts`，modules 在下一层）
- **gen-hook 目标**：所有 web 路由都会生成 useQuery / useMutation hook
- **没有 health controller**（健康检查交给 b2b-api）

## b2b-admin（Next 后台前端）

```
apps/b2b-admin/
├── src/
│   ├── app/                    # Next.js App Router
│   ├── components/
│   ├── hooks/
│   │   └── api/                # 由 gen-hook 填充
│   └── lib/rpc.ts
```

- **modulesDir**：`null`
- **aggregateIndex**：`null`
- **link** 跳过（无 modules）
- **gen-hook 目标**：从 b2b-api 派生的所有 hook 都会同步到这里

## frontend（其它纯前端）

和 b2b-admin 类似但更通用（任何不挂 Elysia modules 的前端项目都可标 `frontend`）：

- **modulesDir**：`null`
- **link** 跳过
- **gen-hook** 仍可作为目标（如果有 `src/hooks/api/`）

## 选错 AppType 的后果

| 实际 | 误标 | 后果 |
|------|------|------|
| b2b-api | web | link 找不到 modules，输出空壳 `applyAllControllers` |
| web | b2b-api | link 在 `src/modules/` 找不到文件，同样空壳 |
| b2b-api | frontend | link 跳过（无 modules），但 `src/modules/index.ts` 还是空文件 |
| b2b-admin | web | link 找不到 modules，warning 后跳过 |
