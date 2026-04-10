/**
 * 健康检查：验证 Pages Functions 与 D1 绑定是否生效。
 * 部署后访问: https://<你的域名>/api/health
 */

interface D1Like {
  prepare: (sql: string) => { first: <T>() => Promise<T | null> };
}

interface Env {
  DB: D1Like;
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const { env } = context;
  if (!env.DB) {
    return Response.json({ ok: true, d1: false, note: 'No DB binding (configure D1 in wrangler / dashboard)' });
  }
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    return Response.json({ ok: true, d1: true });
  } catch {
    return Response.json(
      { ok: false, d1: false, error: 'D1 query failed — check binding and migrations' },
      { status: 500 }
    );
  }
}
