/**
 * Pages Functions：/api/* 路由，数据全部读写 D1。
 */

type D1 = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      first: <T>() => Promise<T | null>;
      all: <T>() => Promise<{ results?: T[] }>;
      run: () => Promise<unknown>;
    };
  };
  batch: (stmts: unknown[]) => Promise<unknown>;
};

interface Env {
  DB: D1;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function seedPoolsIfEmpty(db: D1): Promise<void> {
  const n = await db.prepare('SELECT COUNT(*) as c FROM pools').first<{ c: number }>();
  if ((n?.c ?? 0) > 0) return;
  const defaults = [
    ['1', '日常开销', 0, 3000, '#3b82f6', 0],
    ['2', '储蓄', 0, 0, '#10b981', 1],
    ['3', '娱乐', 0, 1000, '#f59e0b', 2],
  ] as const;
  const stmts = defaults.map(([id, name, balance, budget, color, sort]) =>
    db
      .prepare(
        'INSERT INTO pools (id, name, balance, budget, color, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind(id, name, balance, budget, color, sort)
  );
  await db.batch(stmts);
}

async function getSettings(db: D1): Promise<{
  baseCurrency: string;
  exchangeRates: Record<string, number>;
}> {
  const bc = await db.prepare("SELECT value FROM app_settings WHERE key = 'base_currency'").first<{
    value: string;
  }>();
  const er = await db.prepare("SELECT value FROM app_settings WHERE key = 'exchange_rates'").first<{
    value: string;
  }>();
  const baseCurrency = bc?.value ?? 'CNY';
  let exchangeRates: Record<string, number> = {
    CNY: 1,
    USD: 7.2,
    EUR: 7.8,
    JPY: 0.048,
  };
  if (er?.value) {
    try {
      exchangeRates = { ...exchangeRates, ...JSON.parse(er.value) };
    } catch {
      /* ignore */
    }
  }
  return { baseCurrency, exchangeRates };
}

async function rowToTransactions(
  db: D1,
  rows: Record<string, unknown>[]
): Promise<unknown[]> {
  const allocs = await db.prepare('SELECT * FROM transaction_allocations').all<{
    transaction_id: string;
    pool_id: string;
    amount: number;
  }>();
  const byTx = new Map<string, { poolId: string; amount: number }[]>();
  for (const a of allocs.results ?? []) {
    const list = byTx.get(a.transaction_id) ?? [];
    list.push({ poolId: a.pool_id, amount: a.amount });
    byTx.set(a.transaction_id, list);
  }

  return rows.map((r) => {
    const id = r.id as string;
    const type = r.type as string;
    const base: Record<string, unknown> = {
      id,
      type,
      amount: r.amount,
      originalAmount: r.original_amount,
      currency: r.currency,
      date: r.date,
      note: r.note ?? '',
    };
    if (type === 'expense') base.poolId = r.pool_id;
    if (type === 'transfer') {
      base.fromPoolId = r.from_pool_id;
      base.toPoolId = r.to_pool_id;
    }
    if (type === 'income') base.allocations = byTx.get(id) ?? [];
    return base;
  });
}

async function handleGetState(db: D1): Promise<Response> {
  await seedPoolsIfEmpty(db);
  const { baseCurrency, exchangeRates } = await getSettings(db);

  const poolsRes = await db
    .prepare('SELECT id, name, balance, budget, color FROM pools ORDER BY sort_order, id')
    .all<{
      id: string;
      name: string;
      balance: number;
      budget: number;
      color: string;
    }>();

  const txRows = await db
    .prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC')
    .all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, txRows.results ?? []);

  const presetRows = await db.prepare('SELECT * FROM income_presets ORDER BY id').all<{
    id: string;
    name: string;
  }>();
  const rowLines = await db
    .prepare('SELECT * FROM income_preset_rows ORDER BY preset_id, sort_order')
    .all<{
      preset_id: string;
      pool_id: string;
      percent: number;
    }>();

  const byPreset = new Map<string, { poolId: string; percent: number }[]>();
  for (const line of rowLines.results ?? []) {
    const list = byPreset.get(line.preset_id) ?? [];
    list.push({ poolId: line.pool_id, percent: line.percent });
    byPreset.set(line.preset_id, list);
  }

  const incomePresets = (presetRows.results ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    allocations: byPreset.get(p.id) ?? [],
  }));

  const lastSync = new Date().toISOString();

  return json({
    pools: poolsRes.results ?? [],
    transactions,
    incomePresets,
    baseCurrency,
    exchangeRates,
    lastSync,
  });
}

async function handleHealth(db: D1): Promise<Response> {
  try {
    await db.prepare('SELECT 1').first();
    return json({ ok: true, d1: true });
  } catch {
    return json({ ok: false, d1: false }, 500);
  }
}

async function handlePostTransaction(db: D1, body: Record<string, unknown>): Promise<Response> {
  const type = body.type as string;
  const amount = Number(body.amount);
  const originalAmount = Number(body.originalAmount);
  const currency = String(body.currency ?? 'CNY');
  const date = String(body.date ?? '');
  const note = String(body.note ?? '');
  if (!type || !['income', 'expense', 'transfer'].includes(type)) {
    return json({ error: 'invalid type' }, 400);
  }
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid amount' }, 400);
  if (!date) return json({ error: 'invalid date' }, 400);

  const id = crypto.randomUUID();
  const poolId = (body.poolId as string) ?? null;
  const fromPoolId = (body.fromPoolId as string) ?? null;
  const toPoolId = (body.toPoolId as string) ?? null;

  const stmts: unknown[] = [];

  stmts.push(
    db
      .prepare(
        `INSERT INTO transactions (id, type, amount, original_amount, currency, date, note, pool_id, from_pool_id, to_pool_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        type,
        amount,
        originalAmount,
        currency,
        date,
        note,
        poolId,
        fromPoolId,
        toPoolId
      )
  );

  if (type === 'income') {
    const allocations = body.allocations as { poolId: string; amount: number }[] | undefined;
    if (!allocations?.length) return json({ error: 'income requires allocations' }, 400);
    for (const a of allocations) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO transaction_allocations (transaction_id, pool_id, amount) VALUES (?, ?, ?)'
          )
          .bind(id, a.poolId, a.amount)
      );
      stmts.push(
        db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(a.amount, a.poolId)
      );
    }
  } else if (type === 'expense') {
    if (!poolId) return json({ error: 'expense requires poolId' }, 400);
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance - ? WHERE id = ?').bind(amount, poolId)
    );
  } else if (type === 'transfer') {
    if (!fromPoolId || !toPoolId) return json({ error: 'transfer requires from/to' }, 400);
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance - ? WHERE id = ?').bind(amount, fromPoolId)
    );
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(amount, toPoolId)
    );
  }

  await db.batch(stmts);
  return json({ ok: true, id });
}

type TxRow = {
  id: string;
  type: string;
  amount: number;
  pool_id: string | null;
  from_pool_id: string | null;
  to_pool_id: string | null;
};

async function gatherUndoTransactionStatements(db: D1, id: string, tx: TxRow): Promise<unknown[]> {
  const stmts: unknown[] = [];
  if (tx.type === 'income') {
    const allocs = await db
      .prepare('SELECT pool_id, amount FROM transaction_allocations WHERE transaction_id = ?')
      .bind(id)
      .all<{ pool_id: string; amount: number }>();
    for (const a of allocs.results ?? []) {
      stmts.push(
        db.prepare('UPDATE pools SET balance = balance - ? WHERE id = ?').bind(a.amount, a.pool_id)
      );
    }
    stmts.push(db.prepare('DELETE FROM transaction_allocations WHERE transaction_id = ?').bind(id));
  } else if (tx.type === 'expense' && tx.pool_id) {
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(tx.amount, tx.pool_id)
    );
  } else if (tx.type === 'transfer' && tx.from_pool_id && tx.to_pool_id) {
    stmts.push(
      db
        .prepare('UPDATE pools SET balance = balance + ? WHERE id = ?')
        .bind(tx.amount, tx.from_pool_id)
    );
    stmts.push(
      db
        .prepare('UPDATE pools SET balance = balance - ? WHERE id = ?')
        .bind(tx.amount, tx.to_pool_id)
    );
  }
  return stmts;
}

function gatherApplyTransactionStatements(
  db: D1,
  id: string,
  type: string,
  amount: number,
  poolId: string | null,
  fromPoolId: string | null,
  toPoolId: string | null,
  allocations: { poolId: string; amount: number }[] | undefined
): unknown[] {
  const stmts: unknown[] = [];
  if (type === 'income') {
    if (!allocations?.length) throw new Error('income requires allocations');
    for (const a of allocations) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO transaction_allocations (transaction_id, pool_id, amount) VALUES (?, ?, ?)'
          )
          .bind(id, a.poolId, a.amount)
      );
      stmts.push(
        db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(a.amount, a.poolId)
      );
    }
  } else if (type === 'expense') {
    if (!poolId) throw new Error('expense requires poolId');
    stmts.push(db.prepare('UPDATE pools SET balance = balance - ? WHERE id = ?').bind(amount, poolId));
  } else if (type === 'transfer') {
    if (!fromPoolId || !toPoolId) throw new Error('transfer requires from/to');
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance - ? WHERE id = ?').bind(amount, fromPoolId)
    );
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(amount, toPoolId)
    );
  }
  return stmts;
}

async function handlePatchTransaction(
  db: D1,
  id: string,
  body: Record<string, unknown>
): Promise<Response> {
  const existing = await db
    .prepare('SELECT id, type, amount, pool_id, from_pool_id, to_pool_id FROM transactions WHERE id = ?')
    .bind(id)
    .first<TxRow>();
  if (!existing) return json({ error: 'not found' }, 404);

  const bodyType = String(body.type ?? existing.type);
  if (bodyType !== existing.type) {
    return json({ error: 'cannot change transaction type' }, 400);
  }

  const type = existing.type;
  const amount = Number(body.amount);
  const originalAmount = Number(body.originalAmount ?? body.amount);
  const currency = String(body.currency ?? 'CNY');
  const date = String(body.date ?? '');
  const note = String(body.note ?? '');
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid amount' }, 400);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    return json({ error: 'invalid originalAmount' }, 400);
  }
  if (!date) return json({ error: 'invalid date' }, 400);

  const poolId = (body.poolId as string) ?? null;
  const fromPoolId = (body.fromPoolId as string) ?? null;
  const toPoolId = (body.toPoolId as string) ?? null;
  const allocations = body.allocations as { poolId: string; amount: number }[] | undefined;

  if (type === 'transfer' && fromPoolId && toPoolId && fromPoolId === toPoolId) {
    return json({ error: 'from and to pool must differ' }, 400);
  }

  let applyStmts: unknown[];
  try {
    applyStmts = gatherApplyTransactionStatements(
      db,
      id,
      type,
      amount,
      type === 'expense' ? poolId : null,
      type === 'transfer' ? fromPoolId : null,
      type === 'transfer' ? toPoolId : null,
      type === 'income' ? allocations : undefined
    );
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }

  const undoStmts = await gatherUndoTransactionStatements(db, id, existing);

  const updateStmt = db
    .prepare(
      `UPDATE transactions SET amount = ?, original_amount = ?, currency = ?, date = ?, note = ?, pool_id = ?, from_pool_id = ?, to_pool_id = ? WHERE id = ?`
    )
    .bind(
      amount,
      originalAmount,
      currency,
      date,
      note,
      type === 'expense' ? poolId : null,
      type === 'transfer' ? fromPoolId : null,
      type === 'transfer' ? toPoolId : null,
      id
    );

  await db.batch([...undoStmts, updateStmt, ...applyStmts]);
  return json({ ok: true });
}

async function handleDeleteTransaction(db: D1, id: string): Promise<Response> {
  const tx = await db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first<{
    type: string;
    amount: number;
    pool_id: string | null;
    from_pool_id: string | null;
    to_pool_id: string | null;
  }>();
  if (!tx) return json({ error: 'not found' }, 404);

  const stmts: unknown[] = [];

  if (tx.type === 'income') {
    const allocs = await db
      .prepare('SELECT pool_id, amount FROM transaction_allocations WHERE transaction_id = ?')
      .bind(id)
      .all<{ pool_id: string; amount: number }>();
    for (const a of allocs.results ?? []) {
      stmts.push(
        db
          .prepare('UPDATE pools SET balance = balance - ? WHERE id = ?')
          .bind(a.amount, a.pool_id)
      );
    }
    stmts.push(
      db.prepare('DELETE FROM transaction_allocations WHERE transaction_id = ?').bind(id)
    );
  } else if (tx.type === 'expense' && tx.pool_id) {
    stmts.push(
      db.prepare('UPDATE pools SET balance = balance + ? WHERE id = ?').bind(tx.amount, tx.pool_id)
    );
  } else if (tx.type === 'transfer' && tx.from_pool_id && tx.to_pool_id) {
    stmts.push(
      db
        .prepare('UPDATE pools SET balance = balance + ? WHERE id = ?')
        .bind(tx.amount, tx.from_pool_id)
    );
    stmts.push(
      db
        .prepare('UPDATE pools SET balance = balance - ? WHERE id = ?')
        .bind(tx.amount, tx.to_pool_id)
    );
  }

  stmts.push(db.prepare('DELETE FROM transactions WHERE id = ?').bind(id));
  await db.batch(stmts);
  return json({ ok: true });
}

async function poolInUse(db: D1, poolId: string): Promise<boolean> {
  const t = await db
    .prepare(
      `SELECT COUNT(*) as c FROM transactions WHERE pool_id = ? OR from_pool_id = ? OR to_pool_id = ?`
    )
    .bind(poolId, poolId, poolId)
    .first<{ c: number }>();
  if ((t?.c ?? 0) > 0) return true;
  const a = await db
    .prepare('SELECT COUNT(*) as c FROM transaction_allocations WHERE pool_id = ?')
    .bind(poolId)
    .first<{ c: number }>();
  if ((a?.c ?? 0) > 0) return true;
  const p = await db
    .prepare('SELECT COUNT(*) as c FROM income_preset_rows WHERE pool_id = ?')
    .bind(poolId)
    .first<{ c: number }>();
  return (p?.c ?? 0) > 0;
}

async function handlePostPool(db: D1, body: Record<string, unknown>): Promise<Response> {
  const name = String(body.name ?? '').trim();
  const budget = Number(body.budget ?? 0);
  const color = String(body.color ?? '#3b82f6');
  if (!name) return json({ error: 'name required' }, 400);
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO pools (id, name, balance, budget, color, sort_order) VALUES (?, ?, 0, ?, ?, 999)'
    )
    .bind(id, name, budget, color)
    .run();
  return json({ ok: true, id });
}

async function handlePatchPool(
  db: D1,
  id: string,
  body: Record<string, unknown>
): Promise<Response> {
  const row = await db.prepare('SELECT id FROM pools WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  const name = body.name !== undefined ? String(body.name) : null;
  const budget = body.budget !== undefined ? Number(body.budget) : null;
  const color = body.color !== undefined ? String(body.color) : null;
  const cur = await db
    .prepare('SELECT name, budget, color FROM pools WHERE id = ?')
    .bind(id)
    .first<{ name: string; budget: number; color: string }>();
  if (!cur) return json({ error: 'not found' }, 404);
  await db
    .prepare('UPDATE pools SET name = ?, budget = ?, color = ? WHERE id = ?')
    .bind(name ?? cur.name, budget ?? cur.budget, color ?? cur.color, id)
    .run();
  return json({ ok: true });
}

async function handleDeletePool(db: D1, id: string): Promise<Response> {
  const pool = await db
    .prepare('SELECT balance FROM pools WHERE id = ?')
    .bind(id)
    .first<{ balance: number }>();
  if (!pool) return json({ error: 'not found' }, 404);
  if (Math.abs(pool.balance) > 0.01) {
    return json(
      {
        error:
          '该资金池仍有余额，请先用「转账」将余额转出或调至零后，再尝试删除',
      },
      400
    );
  }
  if (await poolInUse(db, id)) {
    return json({ error: 'pool is referenced by transactions or presets' }, 400);
  }
  await db.prepare('DELETE FROM pools WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handlePostIncomePreset(
  db: D1,
  body: Record<string, unknown>
): Promise<Response> {
  const name = String(body.name ?? '').trim();
  const allocations = body.allocations as { poolId: string; percent: number }[] | undefined;
  if (!name || !allocations?.length) return json({ error: 'invalid preset' }, 400);
  const sum = allocations.reduce((s, a) => s + a.percent, 0);
  if (Math.abs(sum - 100) > 0.02) return json({ error: 'percent sum must be 100' }, 400);
  const id = crypto.randomUUID();
  const stmts: unknown[] = [
    db.prepare('INSERT INTO income_presets (id, name) VALUES (?, ?)').bind(id, name),
  ];
  let order = 0;
  for (const a of allocations) {
    stmts.push(
      db
        .prepare(
          'INSERT INTO income_preset_rows (preset_id, pool_id, percent, sort_order) VALUES (?, ?, ?, ?)'
        )
        .bind(id, a.poolId, a.percent, order++)
    );
  }
  await db.batch(stmts);
  return json({ ok: true, id });
}

async function handlePatchIncomePreset(
  db: D1,
  id: string,
  body: Record<string, unknown>
): Promise<Response> {
  const exists = await db.prepare('SELECT id FROM income_presets WHERE id = ?').bind(id).first();
  if (!exists) return json({ error: 'not found' }, 404);
  const name = body.name !== undefined ? String(body.name).trim() : null;
  const allocations = body.allocations as { poolId: string; percent: number }[] | undefined;

  const stmts: unknown[] = [];
  if (name) {
    stmts.push(db.prepare('UPDATE income_presets SET name = ? WHERE id = ?').bind(name, id));
  }
  if (allocations) {
    const sum = allocations.reduce((s, a) => s + a.percent, 0);
    if (Math.abs(sum - 100) > 0.02) return json({ error: 'percent sum must be 100' }, 400);
    stmts.push(db.prepare('DELETE FROM income_preset_rows WHERE preset_id = ?').bind(id));
    let order = 0;
    for (const a of allocations) {
      stmts.push(
        db
          .prepare(
            'INSERT INTO income_preset_rows (preset_id, pool_id, percent, sort_order) VALUES (?, ?, ?, ?)'
          )
          .bind(id, a.poolId, a.percent, order++)
      );
    }
  }
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true });
}

async function handleDeleteIncomePreset(db: D1, id: string): Promise<Response> {
  await db.prepare('DELETE FROM income_presets WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handlePutSettings(db: D1, body: Record<string, unknown>): Promise<Response> {
  if (body.baseCurrency !== undefined) {
    const v = String(body.baseCurrency);
    await db
      .prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind('base_currency', v)
      .run();
  }
  if (body.exchangeRates !== undefined) {
    await db
      .prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .bind('exchange_rates', JSON.stringify(body.exchangeRates))
      .run();
  }
  return json({ ok: true });
}

// SAN股市处理函数
async function seedSanStocksIfEmpty(db: D1): Promise<void> {
  const n = await db.prepare('SELECT COUNT(*) as c FROM san_stocks').first<{ c: number }>();
  if ((n?.c ?? 0) > 0) return;
  const defaults = [
    ['1', '工作压力', 'WORK', '无穷无尽的KPI和deadline', 100, 85, '#ef4444', 0],
    ['2', '房贷', 'LOAN', '每月固定掉血', 100, 60, '#f97316', 1],
    ['3', '催婚', 'MARR', '来自爸妈的亲切问候', 100, 95, '#eab308', 2],
    ['4', '社交焦虑', 'SOCL', '被迫营业的周末', 100, 70, '#8b5cf6', 3],
    ['5', '健康焦虑', 'HLTH', '体检报告不敢看', 100, 80, '#ec4899', 4],
  ] as const;
  const stmts = defaults.map(([id, name, code, desc, base, current, color, sort]) =>
    db
      .prepare(
        'INSERT INTO san_stocks (id, name, code, description, base_value, current_value, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, name, code, desc, base, current, color, sort)
  );
  await db.batch(stmts);
}

async function handleGetSanStocks(db: D1): Promise<Response> {
  await seedSanStocksIfEmpty(db);
  const stocks = await db
    .prepare('SELECT id, name, code, description, base_value, current_value, color, sort_order FROM san_stocks ORDER BY sort_order, id')
    .all<{
      id: string;
      name: string;
      code: string;
      description: string;
      base_value: number;
      current_value: number;
      color: string;
      sort_order: number;
    }>();
  return json({ stocks: stocks.results ?? [] });
}

async function handlePostSanStock(db: D1, body: Record<string, unknown>): Promise<Response> {
  const name = String(body.name ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();
  const description = String(body.description ?? '').trim();
  const baseValue = Number(body.baseValue ?? 100);
  const currentValue = Number(body.currentValue ?? baseValue);
  const color = String(body.color ?? '#ef4444');
  
  if (!name) return json({ error: 'name required' }, 400);
  if (!code) return json({ error: 'code required' }, 400);
  if (code.length > 10) return json({ error: 'code too long (max 10)' }, 400);
  
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO san_stocks (id, name, code, description, base_value, current_value, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, 999)'
    )
    .bind(id, name, code, description, baseValue, currentValue, color)
    .run();
  
  // 添加初始历史记录
  await db
    .prepare('INSERT INTO san_history (id, stock_id, value, note) VALUES (?, ?, ?, ?)')
    .bind(crypto.randomUUID(), id, currentValue, '初始SAN值')
    .run();
  
  return json({ ok: true, id });
}

async function handlePatchSanStock(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  const row = await db.prepare('SELECT id FROM san_stocks WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  
  const name = body.name !== undefined ? String(body.name).trim() : null;
  const code = body.code !== undefined ? String(body.code).trim().toUpperCase() : null;
  const description = body.description !== undefined ? String(body.description).trim() : null;
  const color = body.color !== undefined ? String(body.color) : null;
  
  const cur = await db
    .prepare('SELECT name, code, description, color FROM san_stocks WHERE id = ?')
    .bind(id)
    .first<{ name: string; code: string; description: string; color: string }>();
  if (!cur) return json({ error: 'not found' }, 404);
  
  await db
    .prepare('UPDATE san_stocks SET name = ?, code = ?, description = ?, color = ? WHERE id = ?')
    .bind(name ?? cur.name, code ?? cur.code, description ?? cur.description, color ?? cur.color, id)
    .run();
  return json({ ok: true });
}

async function handleDeleteSanStock(db: D1, id: string): Promise<Response> {
  await db.prepare('DELETE FROM san_history WHERE stock_id = ?').bind(id).run();
  await db.prepare('DELETE FROM san_stocks WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handlePostSanHistory(db: D1, body: Record<string, unknown>): Promise<Response> {
  const stockId = String(body.stockId ?? '');
  const value = Number(body.value ?? 0);
  const note = String(body.note ?? '').trim();
  
  if (!stockId) return json({ error: 'stockId required' }, 400);
  if (!Number.isFinite(value) || value < 0 || value > 200) {
    return json({ error: 'value must be 0-200' }, 400);
  }
  
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO san_history (id, stock_id, value, note) VALUES (?, ?, ?, ?)')
    .bind(id, stockId, value, note)
    .run();
  
  // 更新当前值
  await db
    .prepare('UPDATE san_stocks SET current_value = ? WHERE id = ?')
    .bind(value, stockId)
    .run();
  
  return json({ ok: true, id });
}

async function handleGetSanHistory(db: D1, stockId: string): Promise<Response> {
  const history = await db
    .prepare('SELECT id, value, note, recorded_at FROM san_history WHERE stock_id = ? ORDER BY recorded_at DESC LIMIT 100')
    .bind(stockId)
    .all<{
      id: string;
      value: number;
      note: string;
      recorded_at: string;
    }>();
  return json({ history: history.results ?? [] });
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (!env.DB) {
    return json({ error: 'D1 not bound' }, 500);
  }

  const db = env.DB;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const segments = pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  try {
    if (pathname === '/api/health' && request.method === 'GET') {
      return handleHealth(db);
    }

    if (pathname === '/api/state' && request.method === 'GET') {
      return handleGetState(db);
    }

    if (pathname === '/api/settings' && request.method === 'PUT') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePutSettings(db, body);
    }

    if (pathname === '/api/transactions' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostTransaction(db, body);
    }

    if (segments[0] === 'transactions' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchTransaction(db, segments[1], body);
    }

    if (segments[0] === 'transactions' && segments[1] && request.method === 'DELETE') {
      return handleDeleteTransaction(db, segments[1]);
    }

    if (pathname === '/api/pools' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostPool(db, body);
    }

    if (segments[0] === 'pools' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchPool(db, segments[1], body);
    }

    if (segments[0] === 'pools' && segments[1] && request.method === 'DELETE') {
      return handleDeletePool(db, segments[1]);
    }

    if (pathname === '/api/income-presets' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostIncomePreset(db, body);
    }

    if (segments[0] === 'income-presets' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchIncomePreset(db, segments[1], body);
    }

    if (segments[0] === 'income-presets' && segments[1] && request.method === 'DELETE') {
      return handleDeleteIncomePreset(db, segments[1]);
    }

    // SAN股市 API
    if (pathname === '/api/san-stocks' && request.method === 'GET') {
      return handleGetSanStocks(db);
    }

    if (pathname === '/api/san-stocks' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostSanStock(db, body);
    }

    if (segments[0] === 'san-stocks' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchSanStock(db, segments[1], body);
    }

    if (segments[0] === 'san-stocks' && segments[1] && request.method === 'DELETE') {
      return handleDeleteSanStock(db, segments[1]);
    }

    if (segments[0] === 'san-stocks' && segments[1] && segments[2] === 'history' && request.method === 'GET') {
      return handleGetSanHistory(db, segments[1]);
    }

    if (pathname === '/api/san-history' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostSanHistory(db, body);
    }

    return json({ error: 'not found', path: pathname }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}
