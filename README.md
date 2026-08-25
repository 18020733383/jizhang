<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Flow 记账

React + Cloudflare Pages Functions + D1 的记账应用。

## 本地运行

需要同时启动 Pages Functions 后端和 Vite 前端：

```bash
npm install
```

终端 1：

```bash
npm run pages:dev
```

终端 2：

```bash
npm run dev
```

前端运行在 `http://localhost:3000`，并将 `/api/*` 代理到 `http://127.0.0.1:8788`。
