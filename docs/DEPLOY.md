# 部署到 Cloudflare Pages + D1

当前应用前端为 **纯静态 + localStorage**；`migrations/` 与 `functions/api/health.ts` 为 **D1 与 Pages Functions 的脚手架**，便于你后续写同步 API。数据真正进 D1 前，需要自行实现 Worker 中的 CRUD（或换用 Hono 等框架）。

## 1. 准备工作

- 安装 [Node.js](https://nodejs.org/)，在项目根目录执行 `npm install`。
- 安装 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)（已作为 devDependency 安装，也可用 `npx wrangler`）。
- 登录 Cloudflare：`npx wrangler login`。

## 2. 创建 D1 数据库

```bash
npx wrangler d1 create jizhang-db
```

命令会输出 `database_id`（UUID）。把它填进根目录 `wrangler.toml` 里的 `database_id = "..."`，替换占位符 `REPLACE_WITH_D1_DATABASE_ID`。

## 3. 执行迁移（建表）

本地（Miniflare）：

```bash
npm run d1:migrate:local
```

线上 D1：

```bash
npm run d1:migrate:remote
```

迁移文件位于 `migrations/0001_initial.sql`。

## 4. 构建与部署 Pages

1. 构建静态资源：`npm run build`（输出目录 `dist/`）。
2. 使用 Wrangler 部署（需已配置 `wrangler.toml` 中的 `database_id`）：

```bash
npm run pages:deploy
```

首次部署若提示项目不存在，可先在 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** 连接仓库，或先用 `wrangler pages project create jizhang` 创建项目。

### 通过 Git 连接 Pages（推荐）

1. 将代码推送到 GitHub/GitLab。
2. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → 选择仓库。
3. 构建设置：
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. 在 **Settings** → **Functions** → **D1 database bindings** 中，为生产环境绑定与 `wrangler.toml` 相同的 D1（binding 名 `DB`），否则 `/api/health` 会返回无数据库绑定提示。

## 5. 验证 Functions + D1

部署完成后访问：

`https://<你的-pages-域名>/api/health`

若返回 `{"ok":true,"d1":true}`，说明 Pages Functions 与 D1 已连通。

## 6. 后续：把记账数据写入 D1

当前 Zustand 仍持久化在浏览器。要云端统一存储，需要：

- 在 `functions/` 下增加 REST 路由（如 `/api/pools`、`/api/transactions`），用 `env.DB.prepare()` 读写；
- 前端用 `fetch` 替换/补充 `persist`，并处理鉴权（如 Cloudflare Access、API Token 或简单会话）。

表结构已与 `migrations/0001_initial.sql` 对齐；`income_presets` / `income_preset_rows` 对应设置里的「收入分配预设」。
