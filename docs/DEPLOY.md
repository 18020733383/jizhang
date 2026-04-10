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
   - **不要**在「Deploy command / 部署命令」里填 `npx wrangler deploy`。那是部署 **Worker** 用的，用于 **Pages** 会报错或产生意外结果。Git 连 Pages 时，构建完成后 Cloudflare **会自动**发布 `dist` + 根目录 `functions/`，一般**无需**额外部署命令；若必须用 Wrangler 发布 Pages，应使用 `npx wrangler pages deploy dist`（见下文），而不是 `wrangler deploy`。
4. **绑定 D1（重要）**  
   - **不是**「环境变量 / Environment variables」那一页。D1 属于 **Bindings（绑定）**，和 KV、R2 一样。  
   - **通过 Git 连接的 Pages**：根目录的 `wrangler.toml` **不会**自动把 D1 绑到线上；必须在控制台里手动加一次绑定（或用下面的 `wrangler pages deploy` 方式部署）。  
   - 控制台路径（若界面略有差异，在 **Settings** 里找 **Bindings** 或 **Functions**）：  
     **Workers & Pages** → 点进你的 **Pages** 项目（图标是橙色/文档状，不是纯 Worker）→ **Settings** → 找到 **Bindings** 或 **Functions** → **D1 database bindings** → **Add binding** → **Variable name** 填 `DB`（须与 `functions/api/health.ts` 里 `env.DB` 一致）→ 选择你已建好的数据库（如 `jizhang-db`）。  
   - 若有 **Production / Preview** 两套环境，**生产环境**也要各绑一次。  
   - 若整个 **Functions / Bindings** 区域都没有：先确认仓库根目录已有 `functions/` 并完成一次成功部署；仍没有则换用 **Wrangler 命令行部署**（会读取 `wrangler.toml` 里的 `[[d1_databases]]`）：

```bash
npm run build
npx wrangler pages deploy dist --project-name=你的Pages项目名
```

## 5. 验证 Functions + D1

部署完成后访问：

`https://<你的-pages-域名>/api/health`

若返回 `{"ok":true,"d1":true}`，说明 Pages Functions 与 D1 已连通。

## 6. 后续：把记账数据写入 D1

当前 Zustand 仍持久化在浏览器。要云端统一存储，需要：

- 在 `functions/` 下增加 REST 路由（如 `/api/pools`、`/api/transactions`），用 `env.DB.prepare()` 读写；
- 前端用 `fetch` 替换/补充 `persist`，并处理鉴权（如 Cloudflare Access、API Token 或简单会话）。

表结构已与 `migrations/0001_initial.sql` 对齐；`income_presets` / `income_preset_rows` 对应设置里的「收入分配预设」。

## 7. 排错：构建成功但部署失败 / 出现 `wrangler deploy` 警告

若日志里在 `npm run build` 成功之后出现：

`Executing user deploy command: npx wrangler deploy`  
以及警告：`wrangler deploy` on a Pages project, `wrangler pages deploy` should be used instead`

说明在 Cloudflare **Pages 项目**里配置了**错误的部署命令**。

**处理：**

1. 打开 **Workers & Pages** → 选中你的 **Pages** 项目 → **Settings** → **Builds & deployments**（或 **Build configuration**）。
2. 找到 **Deploy command**（或「部署命令」「Optional deploy」等），**清空**或 **删除** `npx wrangler deploy`。  
   - 对「用 Git 连接的 Pages」：**通常留空即可**；构建产物目录设为 `dist` 后，平台会自动部署静态资源与 `functions/`。
3. 保存后重新触发一次部署。

若你**刻意**要用命令行代替控制台自动发布，应写成（把项目名换成你的 Pages 名称）：

```bash
npx wrangler pages deploy dist --project-name=你的Pages项目名
```

**不要用** `npx wrangler deploy`（那是 Worker，不是 Pages）。
