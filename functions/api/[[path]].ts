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
  GITHUB_TOKEN?: string;
  AI_API_KEY?: string;
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
    .prepare('SELECT id, name, balance, budget, color, is_card_pool FROM pools ORDER BY sort_order, id')
    .all<{
      id: string;
      name: string;
      balance: number;
      budget: number;
      color: string;
      is_card_pool: number;
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
  if (!type || !['income', 'expense', 'transfer', 'intercept'].includes(type)) {
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
  } else if (type === 'intercept') {
    // 拦截类型不操作资金池，仅作记录
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
  } else if (tx.type === 'intercept') {
    // 拦截类型不操作资金池
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
  } else if (type === 'intercept') {
    // 拦截类型不操作资金池，仅作记录
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
  } else if (tx.type === 'intercept') {
    // 拦截类型不操作资金池
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
// 对赌协议处理函数
async function handleGetBets(db: D1): Promise<Response> {
  const bets = await db
    .prepare('SELECT id, title, start_date, end_date, reward, status, completed_at, note, created_at, target_amount, current_amount, is_starred, sort_order FROM bet_agreements ORDER BY sort_order ASC, is_starred DESC, created_at DESC')
    .all<{
      id: string;
      title: string;
      start_date: string;
      end_date: string;
      reward: number;
      status: string;
      completed_at: string | null;
      note: string;
      created_at: string;
      target_amount: number;
      current_amount: number;
      is_starred: number;
    }>();
  return json({ bets: bets.results ?? [] });
}

async function handlePostBet(db: D1, body: Record<string, unknown>): Promise<Response> {
  const title = String(body.title ?? '').trim();
  const startDate = String(body.startDate ?? '');
  const endDate = String(body.endDate ?? '');
  const reward = Number(body.reward ?? 0);
  const note = String(body.note ?? '').trim();
  const targetAmount = Number(body.targetAmount ?? 0);
  
  if (!title) return json({ error: 'title required' }, 400);
  if (!startDate) return json({ error: 'startDate required' }, 400);
  if (!endDate) return json({ error: 'endDate required' }, 400);
  
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO bet_agreements (id, title, start_date, end_date, reward, status, note, target_amount, current_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, title, startDate, endDate, reward, 'active', note, targetAmount, 0)
    .run();
  
  return json({ ok: true, id });
}

async function handlePatchBet(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  const row = await db.prepare('SELECT id FROM bet_agreements WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  
  const status = body.status !== undefined ? String(body.status) : null;
  const completedAt = body.completedAt !== undefined ? String(body.completedAt) : null;
  const currentAmount = body.currentAmount !== undefined ? Number(body.currentAmount) : null;
  const targetAmount = body.targetAmount !== undefined ? Number(body.targetAmount) : null;
  const isStarred = body.isStarred !== undefined ? (body.isStarred ? 1 : 0) : null;
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : null;
  
  if (status) {
    await db
      .prepare('UPDATE bet_agreements SET status = ?, completed_at = ? WHERE id = ?')
      .bind(status, completedAt, id)
      .run();
  }
  
  if (currentAmount !== null) {
    await db
      .prepare('UPDATE bet_agreements SET current_amount = ? WHERE id = ?')
      .bind(currentAmount, id)
      .run();
  }
  
  if (targetAmount !== null) {
    await db
      .prepare('UPDATE bet_agreements SET target_amount = ? WHERE id = ?')
      .bind(targetAmount, id)
      .run();
  }
  
  if (isStarred !== null) {
    await db
      .prepare('UPDATE bet_agreements SET is_starred = ? WHERE id = ?')
      .bind(isStarred, id)
      .run();
  }
  
  if (sortOrder !== null) {
    await db
      .prepare('UPDATE bet_agreements SET sort_order = ? WHERE id = ?')
      .bind(sortOrder, id)
      .run();
  }
  
  return json({ ok: true });
}

async function handleDeleteBet(db: D1, id: string): Promise<Response> {
  await db.prepare('DELETE FROM bet_agreements WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleLogin(db: D1, body: Record<string, unknown>): Promise<Response> {
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  
  if (!username || !password) {
    return json({ error: '用户名和密码必填' }, 400);
  }
  
  const user = await db.prepare('SELECT id, username, password_hash, trust_level FROM users WHERE username = ?').bind(username).first<{
    id: string;
    username: string;
    password_hash: string;
    trust_level: number;
  }>();
  
  if (!user) {
    return json({ error: '用户名或密码错误' }, 401);
  }
  
  const hash = await hashPassword(password);
  if (hash !== user.password_hash) {
    return json({ error: '用户名或密码错误' }, 401);
  }
  
  return json({
    user: {
      id: user.id,
      username: user.username,
      trustLevel: user.trust_level,
    }
  });
}

async function handleMe(db: D1, userId: string): Promise<Response> {
  const user = await db.prepare('SELECT id, username, trust_level FROM users WHERE id = ?').bind(userId).first<{
    id: string;
    username: string;
    trust_level: number;
  }>();
  
  if (!user) {
    return json({ error: '用户不存在' }, 404);
  }
  
  return json({
    user: {
      id: user.id,
      username: user.username,
      trustLevel: user.trust_level,
    }
  });
}

async function handleCreateUser(db: D1, body: Record<string, unknown>, requestUserId: string): Promise<Response> {
  const requester = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(requestUserId).first<{ trust_level: number }>();
  if (!requester || requester.trust_level < 3) {
    return json({ error: '无权限' }, 403);
  }
  
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const trustLevel = Number(body.trustLevel ?? 1);
  
  if (!username || !password) {
    return json({ error: '用户名和密码必填' }, 400);
  }
  
  if (trustLevel < 1 || trustLevel > 3) {
    return json({ error: '无效的信任等级' }, 400);
  }
  
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').bind(username).first();
  if (existing) {
    return json({ error: '用户名已存在' }, 409);
  }
  
  const id = crypto.randomUUID();
  const hash = await hashPassword(password);
  
  await db.prepare('INSERT INTO users (id, username, password_hash, trust_level) VALUES (?, ?, ?, ?)')
    .bind(id, username, hash, trustLevel)
    .run();
  
  return json({ ok: true, id });
}

async function handleGetUsers(db: D1, userId: string): Promise<Response> {
  const requester = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(userId).first<{ trust_level: number }>();
  if (!requester || requester.trust_level < 3) {
    return json({ error: '无权限' }, 403);
  }
  
  const users = await db.prepare('SELECT id, username, trust_level, created_at FROM users ORDER BY created_at DESC').all<{
    id: string;
    username: string;
    trust_level: number;
    created_at: string;
  }>();
  
  return json({ users: users.results ?? [] });
}

async function handleUpdateUserTrustLevel(db: D1, targetUserId: string, newLevel: number, requestUserId: string): Promise<Response> {
  const requester = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(requestUserId).first<{ trust_level: number }>();
  if (!requester || requester.trust_level < 3) {
    return json({ error: '无权限' }, 403);
  }
  
  if (targetUserId === 'admin') {
    return json({ error: '无法修改管理员权限' }, 400);
  }
  
  await db.prepare('UPDATE users SET trust_level = ? WHERE id = ?').bind(newLevel, targetUserId).run();
  return json({ ok: true });
}

async function handleDeleteUser(db: D1, targetUserId: string, requestUserId: string): Promise<Response> {
  const requester = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(requestUserId).first<{ trust_level: number }>();
  if (!requester || requester.trust_level < 3) {
    return json({ error: '无权限' }, 403);
  }
  
  if (targetUserId === 'admin') {
    return json({ error: '无法删除管理员账号' }, 400);
  }
  
  await db.prepare('DELETE FROM user_privacy WHERE user_id = ?').bind(targetUserId).run();
  await db.prepare('DELETE FROM users WHERE id = ?').bind(targetUserId).run();
  return json({ ok: true });
}

async function handleSetPrivacyLevel(db: D1, body: Record<string, unknown>, userId: string): Promise<Response> {
  const itemType = String(body.itemType ?? '');
  const itemId = String(body.itemId ?? '');
  const privacyLevel = Number(body.privacyLevel ?? 1);
  
  if (!itemType || !itemId) {
    return json({ error: 'itemType和itemId必填' }, 400);
  }
  
  if (privacyLevel < 1 || privacyLevel > 3) {
    return json({ error: '无效的隐私等级' }, 400);
  }
  
  const existing = await db.prepare('SELECT id FROM user_privacy WHERE user_id = ? AND item_type = ? AND item_id = ?')
    .bind(userId, itemType, itemId)
    .first();
  
  if (existing) {
    await db.prepare('UPDATE user_privacy SET privacy_level = ? WHERE user_id = ? AND item_type = ? AND item_id = ?')
      .bind(privacyLevel, userId, itemType, itemId)
      .run();
  } else {
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO user_privacy (id, user_id, item_type, item_id, privacy_level) VALUES (?, ?, ?, ?, ?)')
      .bind(id, userId, itemType, itemId, privacyLevel)
      .run();
  }
  
  return json({ ok: true });
}

async function handleGetPrivacyLevels(db: D1, userId: string): Promise<Response> {
  const levels = await db.prepare('SELECT item_type, item_id, privacy_level FROM user_privacy WHERE user_id = ?')
    .bind(userId)
    .all<{ item_type: string; item_id: string; privacy_level: number }>();
  
  const map: Record<string, Record<string, number>> = {};
  for (const row of levels.results ?? []) {
    if (!map[row.item_type]) map[row.item_type] = {};
    map[row.item_type][row.item_id] = row.privacy_level;
  }
  
  return json({ levels: map });
}

// 虚拟卡号生成 (1802前缀)
function generateCardNumber(denomination: number): string {
  const prefix = '1802';
  const mid = Math.floor(100000 + Math.random() * 900000).toString();
  const denomCode = (denomination / 1000).toString().padStart(4, '0');
  const check = Math.floor(10 + Math.random() * 90).toString();
  return `${prefix}${mid}${denomCode}${check}`;
}

// 虚拟储蓄卡 API
async function handleGetCards(db: D1): Promise<Response> {
  const cards = await db
    .prepare('SELECT * FROM virtual_cards ORDER BY created_at DESC')
    .all<{
      id: string;
      card_number: string;
      card_holder: string;
      denomination: number;
      current_amount: number;
      status: string;
      front_image: string | null;
      back_image: string | null;
      issue_date: string;
      batch_id: string | null;
      printed: number;
      printed_at: string | null;
      depleted_at: string | null;
      created_at: string;
    }>();
  return json({ cards: cards.results ?? [] });
}

async function handlePostCard(db: D1, body: Record<string, unknown>): Promise<Response> {
  const cardHolder = String(body.cardHolder ?? '').trim();
  const denomination = Number(body.denomination ?? 0);
  const backImage = String(body.backImage ?? '').trim();
  const frontImage = String(body.frontImage ?? '').trim();
  const poolName = String(body.poolName ?? '').trim();
  
  if (!cardHolder) return json({ error: '持卡人必填' }, 400);
  if (![1000, 2000, 5000].includes(denomination)) {
    return json({ error: '面额必须是 1000、2000 或 5000' }, 400);
  }
  
  const id = crypto.randomUUID();
  const cardNumber = generateCardNumber(denomination);
  const issueDate = new Date().toISOString().split('T')[0];
  
  // 自动创建对应池子
  const poolId = crypto.randomUUID();
  const finalPoolName = poolName || `卡 ${cardNumber.slice(-8)} 蓄水池`;
  await db
    .prepare('INSERT INTO pools (id, name, balance, budget, color, sort_order, is_card_pool) VALUES (?, ?, 0, ?, ?, 999, 1)')
    .bind(poolId, finalPoolName, denomination, '#8b5cf6')
    .run();
  
  // 创建虚拟卡
  await db
    .prepare(
      'INSERT INTO virtual_cards (id, card_number, card_holder, denomination, current_amount, status, back_image, front_image, issue_date, pool_id) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)'
    )
    .bind(id, cardNumber, cardHolder, denomination, 'saving', backImage || null, frontImage || null, issueDate, poolId)
    .run();
  
  return json({ ok: true, id, cardNumber, poolId, poolName: finalPoolName });
}

async function handlePatchCard(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  const row = await db.prepare('SELECT id, status, current_amount, denomination, pool_id FROM virtual_cards WHERE id = ?').bind(id).first<{
    id: string;
    status: string;
    current_amount: number;
    denomination: number;
    pool_id: string | null;
  }>();
  if (!row) return json({ error: 'not found' }, 404);
  
  const backImage = body.backImage !== undefined ? String(body.backImage) : null;
  const frontImage = body.frontImage !== undefined ? String(body.frontImage) : null;
  const cardHolder = body.cardHolder !== undefined ? String(body.cardHolder) : null;
  const newCardNumber = body.newCardNumber !== undefined ? Boolean(body.newCardNumber) : false;
  const denomination = body.denomination !== undefined ? Number(body.denomination) : null;
  const poolName = body.poolName !== undefined ? String(body.poolName) : null;
  
  const stmts: unknown[] = [];
  if (backImage !== null) {
    stmts.push(db.prepare('UPDATE virtual_cards SET back_image = ? WHERE id = ?').bind(backImage || null, id));
  }
  if (frontImage !== null) {
    stmts.push(db.prepare('UPDATE virtual_cards SET front_image = ? WHERE id = ?').bind(frontImage || null, id));
  }
  if (cardHolder !== null) {
    stmts.push(db.prepare('UPDATE virtual_cards SET card_holder = ? WHERE id = ?').bind(cardHolder, id));
  }
  if (newCardNumber) {
    const generated = generateCardNumber(row.denomination);
    stmts.push(db.prepare('UPDATE virtual_cards SET card_number = ? WHERE id = ?').bind(generated, id));
  }
  if (denomination !== null && denomination !== row.denomination) {
    if (![1000, 2000, 5000].includes(denomination)) {
      return json({ error: '面额必须是 1000、2000 或 5000' }, 400);
    }
    stmts.push(db.prepare('UPDATE virtual_cards SET denomination = ? WHERE id = ?').bind(denomination, id));
    if (row.pool_id) {
      stmts.push(db.prepare('UPDATE pools SET budget = ? WHERE id = ?').bind(denomination, row.pool_id));
    }
  }
  if (poolName !== null && row.pool_id) {
    stmts.push(db.prepare('UPDATE pools SET name = ? WHERE id = ?').bind(poolName, row.pool_id));
  }
  if (stmts.length) await db.batch(stmts);
  
  return json({ ok: true });
}

async function handleMarkCardPrinted(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  const card = await db.prepare('SELECT id, status, current_amount, denomination FROM virtual_cards WHERE id = ?').bind(id).first<{
    id: string;
    status: string;
    current_amount: number;
    denomination: number;
  }>();
  if (!card) return json({ error: 'not found' }, 404);
  
  if (card.current_amount < card.denomination) {
    return json({ error: '卡片未存满，无法打印' }, 400);
  }
  
  const batchId = String(body.batchId ?? '');
  await db
    .prepare('UPDATE virtual_cards SET printed = 1, printed_at = datetime("now"), status = "printed", batch_id = ? WHERE id = ?')
    .bind(batchId, id)
    .run();
  
  return json({ ok: true });
}

async function handleDepleteCard(db: D1, id: string): Promise<Response> {
  const card = await db.prepare('SELECT id, status FROM virtual_cards WHERE id = ?').bind(id).first<{
    id: string;
    status: string;
  }>();
  if (!card) return json({ error: 'not found' }, 404);
  
  if (card.status !== 'printed') {
    return json({ error: '只能弃用已打印的卡片' }, 400);
  }
  
  await db
    .prepare('UPDATE virtual_cards SET status = "depleted", depleted_at = datetime("now") WHERE id = ?')
    .bind(id)
    .run();
  
  return json({ ok: true });
}

async function handleDeleteCard(db: D1, id: string): Promise<Response> {
  const card = await db.prepare('SELECT id, status, pool_id FROM virtual_cards WHERE id = ?').bind(id).first<{
    id: string;
    status: string;
    pool_id: string | null;
  }>();
  if (!card) return json({ error: 'not found' }, 404);
  
  if (card.status !== 'saving') {
    return json({ error: '只能删除蓄力中的卡片' }, 400);
  }
  
  // 删除关联池子 (如果池子余额为0)
  if (card.pool_id) {
    const pool = await db.prepare('SELECT id, balance FROM pools WHERE id = ?').bind(card.pool_id).first<{ id: string; balance: number }>();
    if (pool && Math.abs(pool.balance) < 0.01) {
      await db.prepare('DELETE FROM pools WHERE id = ?').bind(pool.id).run();
    }
  }
  
  await db.prepare('DELETE FROM virtual_cards WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// 解绑卡片池子为普通池子
async function handleUnbindCardPool(db: D1, cardId: string): Promise<Response> {
  const card = await db.prepare('SELECT id, pool_id FROM virtual_cards WHERE id = ?').bind(cardId).first<{
    id: string;
    pool_id: string | null;
  }>();
  if (!card) return json({ error: 'not found' }, 404);
  if (!card.pool_id) return json({ error: '卡片没有关联池子' }, 400);
  
  // 将池子设为普通池子
  await db.prepare('UPDATE pools SET is_card_pool = 0 WHERE id = ?').bind(card.pool_id).run();
  // 清除卡片的池子关联
  await db.prepare('UPDATE virtual_cards SET pool_id = NULL WHERE id = ?').bind(cardId).run();
  
  return json({ ok: true });
}

// 重新绑定卡片池子
async function handleRebindCardPool(db: D1, cardId: string, body: Record<string, unknown>): Promise<Response> {
  const card = await db.prepare('SELECT id, pool_id, denomination FROM virtual_cards WHERE id = ?').bind(cardId).first<{
    id: string;
    pool_id: string | null;
    denomination: number;
  }>();
  if (!card) return json({ error: 'not found' }, 404);
  
  if (card.pool_id) {
    return json({ error: '卡片已有关联池子' }, 400);
  }
  
  const poolName = String(body.poolName ?? '').trim() || `卡 ${card.id.slice(-8)} 蓄水池`;
  const poolId = crypto.randomUUID();
  
  await db
    .prepare('INSERT INTO pools (id, name, balance, budget, color, sort_order, is_card_pool) VALUES (?, ?, 0, ?, ?, 999, 1)')
    .bind(poolId, poolName, card.denomination, '#8b5cf6')
    .run();
  
  await db.prepare('UPDATE virtual_cards SET pool_id = ? WHERE id = ?').bind(poolId, cardId).run();
  
  return json({ ok: true, poolId, poolName });
}

// 图片上传到 GitHub
async function handleUploadImage(request: Request, env: Env): Promise<Response> {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return json({ error: 'GitHub token not configured' }, 500);
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) {
    return json({ error: 'No file provided' }, 400);
  }

  // 限制文件类型和大小
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return json({ error: 'Invalid file type' }, 400);
  }
  if (file.size > 25 * 1024 * 1024) {
    return json({ error: 'File too large (max 25MB)' }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const binary = Array.from(new Uint8Array(arrayBuffer));
  const base64 = btoa(binary.map(b => String.fromCharCode(b)).join(''));
  
  // 生成文件名: cards_时间戳_原文件名
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_').replace(/__/g, '_');
  const fileName = `cards/${timestamp}_${safeName}`;

  const apiUrl = `https://api.github.com/repos/18020733383/jizhang/contents/public/${fileName}`;
  
  // 检查文件是否已存在，获取 SHA
  let sha: string | null = null;
  const getRes = await fetch(apiUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'jizhang-pages'
    }
  });
  if (getRes.ok) {
    const data = await getRes.json() as { sha: string };
    sha = data.sha;
  }

  // 上传到 GitHub
  const body: Record<string, unknown> = {
    message: sha ? `Update card image: ${fileName}` : `Upload card image: ${fileName}`,
    content: base64,
  };
  if (sha) {
    body.sha = sha;
  }

  const githubResponse = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jizhang-pages'
    },
    body: JSON.stringify(body)
  });

  if (!githubResponse.ok) {
    const errorText = await githubResponse.text();
    console.error('GitHub API error:', errorText);
    return json({ error: 'Failed to upload to GitHub' }, 500);
  }

  const result = await githubResponse.json();
  
  // 仓库已设为公开，直接使用 raw URL
  const rawUrl = `https://raw.githubusercontent.com/18020733383/jizhang/main/public/${fileName}`;
  
  return json({ 
    ok: true, 
    url: rawUrl,
    fileName: fileName,
  });
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
    const userId = request.headers.get('X-User-Id') ?? '';
    
    if (pathname === '/api/health' && request.method === 'GET') {
      return handleHealth(db);
    }

    if (pathname === '/api/auth/login' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleLogin(db, body);
    }

    if (pathname === '/api/auth/me' && request.method === 'GET' && userId) {
      return handleMe(db, userId);
    }

    if (pathname === '/api/auth/users' && request.method === 'GET' && userId) {
      return handleGetUsers(db, userId);
    }

    if (pathname === '/api/auth/users' && request.method === 'POST' && userId) {
      const body = (await request.json()) as Record<string, unknown>;
      return handleCreateUser(db, body, userId);
    }

    if (segments[0] === 'auth' && segments[1] === 'users' && segments[2] && segments[3] === 'trust' && request.method === 'PATCH' && userId) {
      const targetUserId = segments[2];
      const body = (await request.json()) as Record<string, unknown>;
      const newLevel = Number(body.newLevel ?? 2);
      return handleUpdateUserTrustLevel(db, targetUserId, newLevel, userId);
    }

    if (segments[0] === 'auth' && segments[1] === 'users' && segments[2] && request.method === 'DELETE' && userId) {
      const targetUserId = segments[2];
      return handleDeleteUser(db, targetUserId, userId);
    }

    if (segments[0] === 'auth' && segments[1] === 'users' && segments[2] && segments[3] === 'trust' && request.method === 'POST' && userId) {
      const targetUserId = segments[2];
      const body = (await request.json()) as Record<string, unknown>;
      const newLevel = Number(body.newLevel ?? 2);
      return handleUpdateUserTrustLevel(db, targetUserId, newLevel, userId);
    }

    if (pathname === '/api/auth/privacy' && request.method === 'POST' && userId) {
      const body = (await request.json()) as Record<string, unknown>;
      return handleSetPrivacyLevel(db, body, userId);
    }

    if (pathname === '/api/auth/privacy' && request.method === 'GET' && userId) {
      return handleGetPrivacyLevels(db, userId);
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

    // 对赌协议 API
    if (pathname === '/api/bets' && request.method === 'GET') {
      return handleGetBets(db);
    }

    if (pathname === '/api/bets' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostBet(db, body);
    }

    if (segments[0] === 'bets' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchBet(db, segments[1], body);
    }

    if (segments[0] === 'bets' && segments[1] && request.method === 'DELETE') {
      return handleDeleteBet(db, segments[1]);
    }

    // 虚拟储蓄卡 API
    if (pathname === '/api/cards' && request.method === 'GET') {
      return handleGetCards(db);
    }

    if (pathname === '/api/cards' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostCard(db, body);
    }

    if (segments[0] === 'cards' && segments[1] && request.method === 'PATCH') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchCard(db, segments[1], body);
    }

    if (segments[0] === 'cards' && segments[1] === 'print' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleMarkCardPrinted(db, segments[2], body);
    }

    if (segments[0] === 'cards' && segments[1] === 'deplete' && request.method === 'POST') {
      return handleDepleteCard(db, segments[2]);
    }

    if (segments[0] === 'cards' && segments[1] === 'unbind' && request.method === 'POST') {
      return handleUnbindCardPool(db, segments[2]);
    }

    if (segments[0] === 'cards' && segments[1] === 'rebind' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleRebindCardPool(db, segments[2], body);
    }

    if (segments[0] === 'cards' && segments[1] && request.method === 'DELETE') {
      return handleDeleteCard(db, segments[1]);
    }

    // 图片上传 API
    if (pathname === '/api/upload' && request.method === 'POST') {
      return handleUploadImage(request, env);
    }

    // 图片代理（私有仓库图片通过此路由访问）
    if (segments[0] === 'card-images' && segments.length > 1 && request.method === 'GET') {
      const fileName = segments.slice(1).join('/');
      const token = env.GITHUB_TOKEN;
      if (!token) {
        return json({ error: 'GitHub token not configured' }, 500);
      }
      
      const githubRes = await fetch(
        `https://api.github.com/repos/18020733383/jizhang/contents/public/${fileName}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3.raw',
            'User-Agent': 'jizhang-pages'
          }
        }
      );
      
      if (!githubRes.ok) {
        return json({ error: 'Image not found' }, 404);
      }
      
      const imageData = await githubRes.arrayBuffer();
      const contentType = fileName.endsWith('.png') ? 'image/png' :
                          fileName.endsWith('.gif') ? 'image/gif' :
                          fileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      
      return new Response(imageData, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          ...CORS_HEADERS
        }
      });
    }

    // AI 生图 API（仅管理员）
    if (pathname === '/api/ai-generate' && request.method === 'POST') {
      if (!userId || !userId.startsWith('admin')) {
        const user = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(userId || '').first<{ trust_level: number }>();
        if (!user || user.trust_level < 3) {
          return json({ error: '无权限' }, 403);
        }
      }
      
      const apiKey = env.AI_API_KEY;
      if (!apiKey) {
        return json({ error: 'AI API key not configured' }, 500);
      }
      
      const body = (await request.json()) as { prompt: string; side: 'front' | 'back' };
      const { prompt: userPrompt, side } = body;
      
      if (!userPrompt) {
        return json({ error: 'prompt required' }, 400);
      }
      
      const cardPrompt = side === 'front' 
        ? `Generate a pure decorative background image for a bank card front side. Aspect ratio 3:2 (landscape, wider than tall). NO text, NO numbers, NO borders, NO frame. Just a beautiful pure background design/pattern. Style: ${userPrompt}. High quality, seamless, suitable for printing on PVC card.`
        : `Generate a pure decorative background image for a bank card back side. Aspect ratio 3:2 (landscape, wider than tall). NO text, NO numbers, NO borders, NO frame, NO magnetic stripe, NO barcode. Just a beautiful pure background design/pattern, slightly different feel from the front. Style: ${userPrompt}. High quality, seamless, suitable for printing on PVC card.`;
      
      try {
        const aiRes = await fetch('https://ai.huan666.de/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'nano-banana-pro',
            messages: [
              { role: 'user', content: cardPrompt }
            ],
            stream: true,
          }),
        });
        
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          console.error('AI API error:', errText);
          return json({ error: 'AI generation failed' }, 500);
        }
        
        // Parse SSE streaming response
        const reader = aiRes.body!.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let finished = false;
        
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === '[DONE]') continue;
            
            // SSE format: data: {...}
            const dataStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
            if (!dataStr || !dataStr.startsWith('{')) continue;
            
            try {
              const parsed = JSON.parse(dataStr) as {
                choices?: Array<{
                  delta?: { content?: string };
                  finish_reason?: string | null;
                }>;
              };
              
              const delta = parsed.choices?.[0]?.delta?.content || '';
              fullContent += delta;
              
              // Wait for finish_reason to be non-null before extracting URLs
              if (parsed.choices?.[0]?.finish_reason !== null && parsed.choices?.[0]?.finish_reason !== undefined) {
                finished = true;
              }
            } catch { /* skip invalid JSON */ }
          }
        }
        
        // Extract image URLs from the response
        const urls: string[] = [];
        
        // Match markdown image syntax ![alt](url)
        const mdRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
        let mdMatch;
        while ((mdMatch = mdRegex.exec(fullContent)) !== null) {
          urls.push(mdMatch[1]);
        }
        
        // Match plain URLs
        const urlRegex = /https?:\/\/[^\s"'<>\)\]]+/gi;
        const plainUrls = fullContent.match(urlRegex) || [];
        for (const u of plainUrls) {
          const clean = u.replace(/[.,;:!?]+$/, '');
          if (clean.includes('.png') || clean.includes('.jpg') || clean.includes('.jpeg') || 
              clean.includes('.gif') || clean.includes('.webp') || clean.includes('.bmp') ||
              clean.includes('/image') || clean.includes('/img') || clean.includes('photo') ||
              clean.includes('generated') || clean.includes('upload')) {
            urls.push(clean);
          }
        }
        
        if (urls.length === 0 && plainUrls.length > 0) {
          for (const u of plainUrls) {
            const clean = u.replace(/[.,;:!?]+$/, '');
            if (clean.startsWith('http')) {
              urls.push(clean);
            }
          }
        }
        
        return json({ ok: true, content: fullContent, urls: [...new Set(urls)] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ error: msg }, 500);
      }
    }

    // AI 下载图片代理
    if (segments[0] === 'ai-image' && request.method === 'GET') {
      const imageUrl = url.searchParams.get('url');
      if (!imageUrl) {
        return json({ error: 'url parameter required' }, 400);
      }
      
      try {
        const imgRes = await fetch(imageUrl, { headers: { 'User-Agent': 'jizhang-pages' } });
        if (!imgRes.ok) {
          return json({ error: 'Failed to download image' }, 502);
        }
        const imgData = await imgRes.arrayBuffer();
        const contentType = imgRes.headers.get('content-type') || 'image/png';
        return new Response(imgData, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=3600',
            ...CORS_HEADERS
          }
        });
      } catch (e) {
        return json({ error: 'Failed to download image' }, 500);
      }
    }

    return json({ error: 'not found', path: pathname }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}
