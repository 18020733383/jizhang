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
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET?: string;
  B2_BUCKET_ID?: string;
  B2_ENDPOINT?: string;
  B2_MAINTENANCE_TOKEN?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GLOBAL_PRIVACY_USER_ID = 'admin';
const LEGACY_GLOBAL_PRIVACY_USER_ID = '__global__';

type PoolMode = 'rollover' | 'monthly';

function parsePoolMode(value: unknown, fallback: PoolMode = 'rollover'): PoolMode {
  return value === 'monthly' || value === 'rollover' ? value : fallback;
}

function parseNonNegativeAmount(value: unknown, fallback = 0): number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function maskText(value: unknown, fallbackLength = 4): string {
  const text = String(value ?? '');
  const length = Math.max(fallbackLength, Array.from(text).length || fallbackLength);
  return '*'.repeat(length);
}

async function getUserTrustLevel(db: D1, userId: string): Promise<number> {
  if (!userId || userId === 'guest') return 1;
  const user = await db.prepare('SELECT trust_level FROM users WHERE id = ?')
    .bind(userId)
    .first<{ trust_level: number }>();
  return user?.trust_level ?? 1;
}

async function getPrivacyLevelMap(db: D1): Promise<Record<string, Record<string, number>>> {
  const levels = await db.prepare(
    `SELECT item_type, item_id, MAX(privacy_level) AS privacy_level
     FROM user_privacy
     WHERE user_id IN (?, ?)
     GROUP BY item_type, item_id`
  )
    .bind(GLOBAL_PRIVACY_USER_ID, LEGACY_GLOBAL_PRIVACY_USER_ID)
    .all<{ item_type: string; item_id: string; privacy_level: number }>();

  const map: Record<string, Record<string, number>> = {};
  for (const row of levels.results ?? []) {
    if (!map[row.item_type]) map[row.item_type] = {};
    map[row.item_type][row.item_id] = row.privacy_level;
  }
  return map;
}

function shouldMaskItem(
  privacyLevels: Record<string, Record<string, number>>,
  userTrustLevel: number,
  itemType: string,
  itemId: string
): boolean {
  if (userTrustLevel >= 3) return false;
  const requiredLevel = privacyLevels[itemType]?.[itemId] ?? 1;
  return userTrustLevel < requiredLevel;
}

async function seedPoolsIfEmpty(db: D1): Promise<void> {
  const n = await db.prepare('SELECT COUNT(*) as c FROM pools').first<{ c: number }>();
  if ((n?.c ?? 0) > 0) return;
  const defaults = [
    ['1', '日常开销', 0, 3000, '#3b82f6', 0],
    ['3', '娱乐', 0, 1000, '#f59e0b', 1],
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

async function handleGetState(db: D1, userId = ''): Promise<Response> {
  await seedPoolsIfEmpty(db);
  const { baseCurrency, exchangeRates } = await getSettings(db);
  const userTrustLevel = await getUserTrustLevel(db, userId);
  const privacyLevels = await getPrivacyLevelMap(db);

  const poolsRes = await db
    .prepare('SELECT id, name, balance, budget, pool_mode, target_amount, color FROM pools ORDER BY sort_order, id')
    .all<{
      id: string;
      name: string;
      balance: number;
      budget: number;
      pool_mode: PoolMode;
      target_amount: number;
      color: string;
    }>();

  const pools = (poolsRes.results ?? []).map(p => {
    const masked = shouldMaskItem(privacyLevels, userTrustLevel, 'pools', p.id);
    return {
      id: p.id,
      name: masked ? maskText(p.name) : p.name,
      balance: masked ? 0 : p.balance,
      budget: masked ? 0 : p.budget,
      mode: p.pool_mode,
      targetAmount: masked ? 0 : p.target_amount,
      color: p.color,
    };
  });

  const txRows = await db
    .prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC')
    .all<Record<string, unknown>>();
  const transactions = (await rowToTransactions(db, txRows.results ?? [])).map((tx) => {
    const masked = shouldMaskItem(privacyLevels, userTrustLevel, 'transactions', tx.id);
    if (!masked) return tx;
    return {
      ...tx,
      amount: 0,
      originalAmount: 0,
      note: maskText(tx.note || '-', 4),
      allocations: tx.allocations?.map((allocation) => ({
        poolId: allocation.poolId,
        amount: 0,
      })),
    };
  });

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
    pools,
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
  const budget = parseNonNegativeAmount(body.budget);
  const mode = parsePoolMode(body.mode);
  const targetAmount = parseNonNegativeAmount(body.targetAmount);
  const color = String(body.color ?? '#3b82f6');
  if (!name) return json({ error: 'name required' }, 400);
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO pools (id, name, balance, budget, pool_mode, target_amount, color, sort_order) VALUES (?, ?, 0, ?, ?, ?, ?, 999)'
    )
    .bind(id, name, budget, mode, targetAmount, color)
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
  const budget = body.budget !== undefined ? parseNonNegativeAmount(body.budget) : null;
  const mode = body.mode !== undefined ? parsePoolMode(body.mode) : null;
  const targetAmount = body.targetAmount !== undefined ? parseNonNegativeAmount(body.targetAmount) : null;
  const color = body.color !== undefined ? String(body.color) : null;
  const cur = await db
    .prepare('SELECT name, budget, pool_mode, target_amount, color FROM pools WHERE id = ?')
    .bind(id)
    .first<{ name: string; budget: number; pool_mode: PoolMode; target_amount: number; color: string }>();
  if (!cur) return json({ error: 'not found' }, 404);
  await db
    .prepare('UPDATE pools SET name = ?, budget = ?, pool_mode = ?, target_amount = ?, color = ? WHERE id = ?')
    .bind(
      name ?? cur.name,
      budget ?? cur.budget,
      mode ?? cur.pool_mode,
      targetAmount ?? cur.target_amount,
      color ?? cur.color,
      id
    )
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
async function ensureBetAgreementSchema(db: D1): Promise<void> {
  const info = await db.prepare('PRAGMA table_info(bet_agreements)').all<{ name: string }>();
  const columns = new Set((info.results ?? []).map((row) => row.name));
  const alters: Promise<unknown>[] = [];

  if (!columns.has('agreement_type')) {
    alters.push(db.prepare("ALTER TABLE bet_agreements ADD COLUMN agreement_type TEXT NOT NULL DEFAULT 'standard'").run());
  }
  if (!columns.has('share_count')) {
    alters.push(db.prepare('ALTER TABLE bet_agreements ADD COLUMN share_count REAL NOT NULL DEFAULT 0').run());
  }
  if (!columns.has('share_price')) {
    alters.push(db.prepare('ALTER TABLE bet_agreements ADD COLUMN share_price REAL NOT NULL DEFAULT 0').run());
  }

  await Promise.all(alters);
}

async function handleGetBets(db: D1): Promise<Response> {
  await ensureBetAgreementSchema(db);
  const bets = await db
    .prepare('SELECT id, title, start_date, end_date, reward, status, completed_at, note, created_at, target_amount, current_amount, is_starred, sort_order, agreement_type, share_count, share_price FROM bet_agreements ORDER BY sort_order ASC, is_starred DESC, created_at DESC')
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
      agreement_type: string;
      share_count: number;
      share_price: number;
    }>();
  return json({ bets: bets.results ?? [] });
}

async function handlePostBet(db: D1, body: Record<string, unknown>): Promise<Response> {
  await ensureBetAgreementSchema(db);
  const title = String(body.title ?? '').trim();
  const startDate = String(body.startDate ?? '');
  const endDate = String(body.endDate ?? '');
  const reward = Number(body.reward ?? 0);
  const note = String(body.note ?? '').trim();
  const targetAmount = Number(body.targetAmount ?? 0);
  const agreementType = String(body.agreementType ?? 'standard');
  const shareCount = Number(body.shareCount ?? 0);
  const sharePrice = Number(body.sharePrice ?? 0);
  
  if (!title) return json({ error: 'title required' }, 400);
  if (!startDate) return json({ error: 'startDate required' }, 400);
  if (!endDate) return json({ error: 'endDate required' }, 400);
  if (!['standard', 'equity'].includes(agreementType)) return json({ error: 'invalid agreementType' }, 400);
  
  const id = crypto.randomUUID();
  await db
    .prepare(
      'INSERT INTO bet_agreements (id, title, start_date, end_date, reward, status, note, target_amount, current_amount, agreement_type, share_count, share_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(id, title, startDate, endDate, reward, 'active', note, targetAmount, 0, agreementType, shareCount, sharePrice)
    .run();
  
  return json({ ok: true, id });
}

async function handlePatchBet(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  await ensureBetAgreementSchema(db);
  const row = await db.prepare('SELECT id FROM bet_agreements WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'not found' }, 404);
  
  const status = body.status !== undefined ? String(body.status) : null;
  const completedAt = body.completedAt !== undefined ? String(body.completedAt) : null;
  const currentAmount = body.currentAmount !== undefined ? Number(body.currentAmount) : null;
  const targetAmount = body.targetAmount !== undefined ? Number(body.targetAmount) : null;
  const isStarred = body.isStarred !== undefined ? (body.isStarred ? 1 : 0) : null;
  const sortOrder = body.sortOrder !== undefined ? Number(body.sortOrder) : null;
  const title = body.title !== undefined ? String(body.title) : null;
  const startDate = body.startDate !== undefined ? String(body.startDate) : null;
  const endDate = body.endDate !== undefined ? String(body.endDate) : null;
  const reward = body.reward !== undefined ? Number(body.reward) : null;
  const note = body.note !== undefined ? String(body.note) : null;
  const agreementType = body.agreementType !== undefined ? String(body.agreementType) : null;
  const shareCount = body.shareCount !== undefined ? Number(body.shareCount) : null;
  const sharePrice = body.sharePrice !== undefined ? Number(body.sharePrice) : null;

  const stmts: unknown[] = [];
  if (status) {
    stmts.push(db.prepare('UPDATE bet_agreements SET status = ?, completed_at = ? WHERE id = ?').bind(status, completedAt, id));
  }
  if (currentAmount !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET current_amount = ? WHERE id = ?').bind(currentAmount, id));
  }
  if (targetAmount !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET target_amount = ? WHERE id = ?').bind(targetAmount, id));
  }
  if (isStarred !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET is_starred = ? WHERE id = ?').bind(isStarred, id));
  }
  if (sortOrder !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET sort_order = ? WHERE id = ?').bind(sortOrder, id));
  }
  if (title !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET title = ? WHERE id = ?').bind(title, id));
  }
  if (startDate !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET start_date = ? WHERE id = ?').bind(startDate, id));
  }
  if (endDate !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET end_date = ? WHERE id = ?').bind(endDate, id));
  }
  if (reward !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET reward = ? WHERE id = ?').bind(reward, id));
  }
  if (note !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET note = ? WHERE id = ?').bind(note, id));
  }
  if (agreementType !== null) {
    if (!['standard', 'equity'].includes(agreementType)) {
      return json({ error: 'invalid agreementType' }, 400);
    }
    stmts.push(db.prepare('UPDATE bet_agreements SET agreement_type = ? WHERE id = ?').bind(agreementType, id));
  }
  if (shareCount !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET share_count = ? WHERE id = ?').bind(shareCount, id));
  }
  if (sharePrice !== null) {
    stmts.push(db.prepare('UPDATE bet_agreements SET share_price = ? WHERE id = ?').bind(sharePrice, id));
  }
  if (stmts.length) await db.batch(stmts);
  
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
  const requester = await db.prepare('SELECT trust_level FROM users WHERE id = ?').bind(userId).first<{ trust_level: number }>();
  if (!requester || requester.trust_level < 3) {
    return json({ error: '无权限' }, 403);
  }

  const itemType = String(body.itemType ?? '');
  const itemId = String(body.itemId ?? '');
  const privacyLevel = Number(body.privacyLevel ?? 1);
  
  if (!itemType || !itemId) {
    return json({ error: 'itemType和itemId必填' }, 400);
  }
  
  if (privacyLevel < 1 || privacyLevel > 3) {
    return json({ error: '无效的隐私等级' }, 400);
  }
  
  await db.prepare('DELETE FROM user_privacy WHERE item_type = ? AND item_id = ?')
    .bind(itemType, itemId)
    .run();

  const id = crypto.randomUUID();
  await db.prepare('INSERT INTO user_privacy (id, user_id, item_type, item_id, privacy_level) VALUES (?, ?, ?, ?, ?)')
    .bind(id, GLOBAL_PRIVACY_USER_ID, itemType, itemId, privacyLevel)
    .run();
  
  return json({ ok: true });
}

async function handleGetPrivacyLevels(db: D1): Promise<Response> {
  return json({ levels: await getPrivacyLevelMap(db) });
}

// ===== API Token Management (管理员) =====

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = 'sk_';
  for (let i = 0; i < 40; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

async function verifyApiToken(db: D1, token: string): Promise<{ valid: boolean; isAdmin: boolean }> {
  const row = await db
    .prepare('SELECT is_active, is_admin FROM api_tokens WHERE token = ?')
    .bind(token)
    .first<{ is_active: number; is_admin: number }>();
  if (!row || !row.is_active) return { valid: false, isAdmin: false };
  await db.prepare('UPDATE api_tokens SET last_used_at = datetime(\'now\') WHERE token = ?').bind(token).run();
  return { valid: true, isAdmin: !!row.is_admin };
}

async function handleCreateToken(db: D1, body: Record<string, unknown>): Promise<Response> {
  const name = String(body.name ?? '').trim();
  const isAdmin = body.isAdmin ? 1 : 0;
  if (!name) return json({ error: 'name required' }, 400);
  const id = crypto.randomUUID();
  const token = generateToken();
  await db
    .prepare('INSERT INTO api_tokens (id, name, token, is_admin) VALUES (?, ?, ?, ?)')
    .bind(id, name, token, isAdmin)
    .run();
  return json({ ok: true, id, name, token, is_admin: isAdmin });
}

async function handleListTokens(db: D1): Promise<Response> {
  const rows = await db
    .prepare('SELECT id, name, token, is_active, is_admin, created_at, last_used_at FROM api_tokens ORDER BY created_at DESC')
    .all<{ id: string; name: string; token: string; is_active: number; is_admin: number; created_at: string; last_used_at: string | null }>();
  return json({ tokens: rows.results ?? [] });
}

async function handlePatchToken(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  const isActive = body.isActive !== undefined ? (body.isActive ? 1 : 0) : null;
  const isAdmin = body.isAdmin !== undefined ? (body.isAdmin ? 1 : 0) : null;
  const stmts: unknown[] = [];
  if (isActive !== null) stmts.push(db.prepare('UPDATE api_tokens SET is_active = ? WHERE id = ?').bind(isActive, id));
  if (isAdmin !== null) stmts.push(db.prepare('UPDATE api_tokens SET is_admin = ? WHERE id = ?').bind(isAdmin, id));
  if (stmts.length) await db.batch(stmts);
  return json({ ok: true });
}

async function handleDeleteToken(db: D1, id: string): Promise<Response> {
  await db.prepare('DELETE FROM api_tokens WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ===== Open API v1 (Token鉴权) =====

async function handleOpenApiGetState(db: D1): Promise<Response> {
  const { baseCurrency, exchangeRates } = await getSettings(db);
  const poolsRows = await db.prepare('SELECT id, name, balance, budget, pool_mode, target_amount, color FROM pools ORDER BY sort_order, id').all<{ id: string; name: string; balance: number; budget: number; pool_mode: PoolMode; target_amount: number; color: string }>();
  const pools = (poolsRows.results ?? []).map((pool) => ({
    id: pool.id,
    name: pool.name,
    balance: pool.balance,
    budget: pool.budget,
    mode: pool.pool_mode,
    targetAmount: pool.target_amount,
    color: pool.color,
  }));
  const txRows = await db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 100').all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, txRows.results ?? []);
  return json({ pools, transactions, baseCurrency, exchangeRates });
}

function buildOpenApiTransactionFilters(url: URL): {
  conditions: string[];
  params: unknown[];
} {
  const type = url.searchParams.get('type');
  const poolId = url.searchParams.get('poolId');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (poolId) {
    conditions.push('(pool_id = ? OR from_pool_id = ? OR to_pool_id = ?)');
    params.push(poolId, poolId, poolId);
  }
  if (dateFrom) {
    conditions.push('date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('date <= ?');
    params.push(dateTo);
  }
  return { conditions, params };
}

async function handleOpenApiGetTransactions(db: D1, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 1000);
  const offset = Number(url.searchParams.get('offset') || '0');
  const { conditions, params } = buildOpenApiTransactionFilters(url);
  let countSql = 'SELECT COUNT(*) as c FROM transactions';
  let sql = 'SELECT * FROM transactions';
  if (conditions.length) {
    const where = ' WHERE ' + conditions.join(' AND ');
    countSql += where;
    sql += where;
  }
  const totalRow = await db.prepare(countSql).bind(...params).first<{ c: number }>();
  const total = totalRow?.c ?? 0;
  sql += ' ORDER BY date DESC, id DESC LIMIT ? OFFSET ?';
  const rows = await db.prepare(sql).bind(...params, limit, offset).all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, rows.results ?? []);
  return json({ transactions, total, limit, offset });
}

/** 完整账单导出：不受 1000 条分页限制，支持 JSON / CSV */
async function handleOpenApiExportTransactions(db: D1, url: URL): Promise<Response> {
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  const { conditions, params } = buildOpenApiTransactionFilters(url);
  let sql = 'SELECT * FROM transactions';
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY date DESC, id DESC';
  const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, rows.results ?? []);

  if (format === 'csv') {
    const headers = [
      'id',
      'type',
      'amount',
      'originalAmount',
      'currency',
      'date',
      'note',
      'poolId',
      'fromPoolId',
      'toPoolId',
      'allocations',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...transactions.map((t) =>
        [
          t.id,
          t.type,
          t.amount,
          t.originalAmount,
          t.currency,
          t.date,
          t.note,
          t.poolId ?? '',
          t.fromPoolId ?? '',
          t.toPoolId ?? '',
          t.allocations ? JSON.stringify(t.allocations) : '',
        ]
          .map(escape)
          .join(',')
      ),
    ];
    return new Response(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="jizhang-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return json({
    exportedAt: new Date().toISOString(),
    total: transactions.length,
    transactions,
  });
}

async function handleOpenApiGetPools(db: D1): Promise<Response> {
  const rows = await db.prepare('SELECT id, name, balance, budget, pool_mode, target_amount, color FROM pools ORDER BY sort_order, id').all<{ id: string; name: string; balance: number; budget: number; pool_mode: PoolMode; target_amount: number; color: string }>();
  return json({ pools: (rows.results ?? []).map((pool) => ({
    id: pool.id,
    name: pool.name,
    balance: pool.balance,
    budget: pool.budget,
    mode: pool.pool_mode,
    targetAmount: pool.target_amount,
    color: pool.color,
  })) });
}

async function handleOpenApiGetBets(db: D1): Promise<Response> {
  const rows = await db.prepare('SELECT * FROM bet_agreements ORDER BY sort_order ASC, is_starred DESC, created_at DESC').all();
  return json({ bets: rows.results ?? [] });
}

async function handleOpenApiGetStats(db: D1): Promise<Response> {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const txRows = await db.prepare('SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC').bind(`${thisMonth}%`).all<Record<string, unknown>>();
  const txs = await rowToTransactions(db, txRows.results ?? []);
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const byPool: Record<string, number> = {};
  for (const t of txs) {
    if (t.type === 'expense' && t.poolId) byPool[t.poolId] = (byPool[t.poolId] || 0) + Number(t.amount);
  }
  const pools = await db.prepare('SELECT id, name, balance FROM pools').all<{ id: string; name: string; balance: number }>();
  const poolStats = (pools.results ?? []).map(p => ({ id: p.id, name: p.name, balance: p.balance, spending: byPool[p.id] || 0 }));
  const activeBets = await db.prepare('SELECT COUNT(*) as c FROM bet_agreements WHERE status = ?').bind('active').first<{ c: number }>();
  return json({ month: thisMonth, income, expense, netIncome: income - expense, poolStats, bets: { active: activeBets?.c ?? 0 } });
}

type B2FileVersion = {
  action: string;
  contentLength: number;
  contentType?: string | null;
  fileId: string;
  fileName: string;
  uploadTimestamp: number;
};

type B2Authorization = {
  authorizationToken: string;
  apiInfo: {
    storageApi: {
      apiUrl: string;
      allowed: {
        buckets: Array<{ id: string; name: string }>;
        capabilities: string[];
        namePrefix: string | null;
      };
    };
  };
};

async function secureTokenMatches(actual: string | null, expected?: string): Promise<boolean> {
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const actualBytes = new Uint8Array(actualHash);
  const expectedBytes = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < actualBytes.length; i += 1) {
    difference |= actualBytes[i] ^ expectedBytes[i];
  }
  return difference === 0;
}

async function authorizeB2(env: Env): Promise<B2Authorization> {
  if (!env.B2_KEY_ID || !env.B2_APP_KEY || !env.B2_BUCKET_ID) {
    throw new Error('B2 credentials are not configured');
  }

  const credentials = btoa(`${env.B2_KEY_ID.trim()}:${env.B2_APP_KEY.trim()}`);
  const response = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`B2 authorization failed (${response.status}): ${detail}`);
  }

  return response.json<B2Authorization>();
}

async function callB2<T>(auth: B2Authorization, operation: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${auth.apiInfo.storageApi.apiUrl}/b2api/v4/${operation}`, {
    method: 'POST',
    headers: {
      Authorization: auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`B2 ${operation} failed (${response.status}): ${detail}`);
  }
  return response.json<T>();
}

async function listB2FileVersions(env: Env, auth: B2Authorization): Promise<B2FileVersion[]> {
  const files: B2FileVersion[] = [];
  let startFileName: string | undefined;
  let startFileId: string | undefined;

  for (let page = 0; page < 100; page += 1) {
    const result = await callB2<{
      files: B2FileVersion[];
      nextFileName?: string | null;
      nextFileId?: string | null;
    }>(auth, 'b2_list_file_versions', {
      bucketId: env.B2_BUCKET_ID?.trim(),
      maxFileCount: 1000,
      ...(startFileName ? { startFileName } : {}),
      ...(startFileId ? { startFileId } : {}),
    });
    files.push(...result.files);
    if (!result.nextFileName) return files;
    startFileName = result.nextFileName;
    startFileId = result.nextFileId ?? undefined;
  }

  throw new Error('B2 file listing exceeded the 100-page safety limit');
}

function summarizeB2Files(env: Env, auth: B2Authorization, files: B2FileVersion[]) {
  const currentUploads = new Map<string, B2FileVersion>();
  for (const file of files) {
    if (!currentUploads.has(file.fileName) && file.action === 'upload') {
      currentUploads.set(file.fileName, file);
    }
  }
  return {
    bucket: env.B2_BUCKET,
    bucketId: env.B2_BUCKET_ID,
    allowedBuckets: auth.apiInfo.storageApi.allowed.buckets,
    capabilities: auth.apiInfo.storageApi.allowed.capabilities,
    namePrefix: auth.apiInfo.storageApi.allowed.namePrefix,
    versionCount: files.length,
    currentFileCount: currentUploads.size,
    storedBytesAcrossVersions: files.reduce((sum, file) => sum + Number(file.contentLength || 0), 0),
    files: files.map((file) => ({
      action: file.action,
      contentLength: file.contentLength,
      contentType: file.contentType,
      fileId: file.fileId,
      fileName: file.fileName,
      uploadTimestamp: file.uploadTimestamp,
    })),
  };
}

async function handleB2Maintenance(request: Request, env: Env): Promise<Response> {
  const authorized = await secureTokenMatches(
    request.headers.get('X-Maintenance-Token'),
    env.B2_MAINTENANCE_TOKEN
  );
  if (!authorized) return json({ error: 'not found' }, 404);

  const auth = await authorizeB2(env);
  const files = await listB2FileVersions(env, auth);

  if (request.method === 'GET') {
    return json(summarizeB2Files(env, auth, files));
  }

  if (request.method === 'DELETE') {
    const oldCardVersions = files.filter((file) => file.fileName.startsWith('cards/'));
    const deleted: Array<{ fileName: string; fileId: string }> = [];
    for (const file of oldCardVersions) {
      await callB2<{ fileName: string; fileId: string }>(auth, 'b2_delete_file_version', {
        fileName: file.fileName,
        fileId: file.fileId,
      });
      deleted.push({ fileName: file.fileName, fileId: file.fileId });
    }

    const remainingFiles = await listB2FileVersions(env, auth);
    return json({
      deletedCount: deleted.length,
      deletedBytes: oldCardVersions.reduce((sum, file) => sum + Number(file.contentLength || 0), 0),
      remaining: summarizeB2Files(env, auth, remainingFiles),
    });
  }

  return json({ error: 'method not allowed' }, 405);
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

    if (pathname === '/api/b2-maintenance' && (request.method === 'GET' || request.method === 'DELETE')) {
      return handleB2Maintenance(request, env);
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

    if (pathname === '/api/auth/privacy' && request.method === 'GET') {
      return handleGetPrivacyLevels(db);
    }

    if (pathname === '/api/state' && request.method === 'GET') {
      return handleGetState(db, userId);
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

    // ===== Token Management (Admin only) =====
    if (pathname === '/api/admin/tokens' && request.method === 'POST' && userId) {
      const body = (await request.json()) as Record<string, unknown>;
      return handleCreateToken(db, body);
    }

    if (pathname === '/api/admin/tokens' && request.method === 'GET' && userId) {
      return handleListTokens(db);
    }

    if (segments[0] === 'admin' && segments[1] === 'tokens' && segments[2] && request.method === 'PATCH' && userId) {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePatchToken(db, segments[2], body);
    }

    if (segments[0] === 'admin' && segments[1] === 'tokens' && segments[2] && request.method === 'DELETE' && userId) {
      return handleDeleteToken(db, segments[2]);
    }

    // ===== Open API v1 (Token鉴权) =====
    if (pathname.startsWith('/api/v1/')) {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) return json({ error: 'Authorization token required. Use: Authorization: Bearer sk_xxx' }, 401);
      const auth = await verifyApiToken(db, token);
      if (!auth.valid) return json({ error: 'Invalid or inactive token' }, 403);

      const v1Path = pathname.replace('/api/v1/', '');
      const v1Segments = v1Path.split('/').filter(Boolean);

      if (v1Path === 'state' && request.method === 'GET') return handleOpenApiGetState(db);
      if (v1Path === 'transactions' && request.method === 'GET') return handleOpenApiGetTransactions(db, url);
      if ((v1Path === 'export/transactions' || v1Path === 'transactions/export') && request.method === 'GET') {
        return handleOpenApiExportTransactions(db, url);
      }
      if (v1Path === 'pools' && request.method === 'GET') return handleOpenApiGetPools(db);
      if (v1Path === 'bets' && request.method === 'GET') return handleOpenApiGetBets(db);
      if (v1Path === 'stats' && request.method === 'GET') return handleOpenApiGetStats(db);

      if (v1Path === 'transactions' && request.method === 'POST') {
        const body = (await request.json()) as Record<string, unknown>;
        return handlePostTransaction(db, body);
      }
      if (v1Segments[0] === 'transactions' && v1Segments[1] && request.method === 'PATCH') {
        const body = (await request.json()) as Record<string, unknown>;
        return handlePatchTransaction(db, v1Segments[1], body);
      }
      if (v1Segments[0] === 'transactions' && v1Segments[1] && request.method === 'DELETE') {
        return handleDeleteTransaction(db, v1Segments[1]);
      }

      return json({ error: 'not found', path: `/api/v1/${v1Path}` }, 404);
    }

    return json({ error: 'not found', path: pathname }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}
