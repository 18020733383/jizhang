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
  B2_KEY_ID?: string;
  B2_APP_KEY?: string;
  B2_BUCKET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const GLOBAL_PRIVACY_USER_ID = 'admin';
const LEGACY_GLOBAL_PRIVACY_USER_ID = '__global__';

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

async function handleGetState(db: D1, userId = ''): Promise<Response> {
  await seedPoolsIfEmpty(db);
  const { baseCurrency, exchangeRates } = await getSettings(db);
  const userTrustLevel = await getUserTrustLevel(db, userId);
  const privacyLevels = await getPrivacyLevelMap(db);

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

  const pools = (poolsRes.results ?? []).map(p => {
    const masked = shouldMaskItem(privacyLevels, userTrustLevel, 'pools', p.id);
    return {
      id: p.id,
      name: masked ? maskText(p.name) : p.name,
      balance: masked ? 0 : p.balance,
      budget: masked ? 0 : p.budget,
      color: p.color,
      isCardPool: p.is_card_pool,
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
  const poolsRows = await db.prepare('SELECT id, name, balance, budget, color, is_card_pool FROM pools ORDER BY sort_order, id').all<{ id: string; name: string; balance: number; budget: number; color: string; is_card_pool: number }>();
  const pools = (poolsRows.results ?? []).map(p => ({ id: p.id, name: p.name, balance: p.balance, budget: p.budget, color: p.color, isCardPool: p.is_card_pool }));
  const txRows = await db.prepare('SELECT * FROM transactions ORDER BY date DESC, id DESC LIMIT 100').all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, txRows.results ?? []);
  return json({ pools, transactions, baseCurrency, exchangeRates });
}

async function handleOpenApiGetTransactions(db: D1, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 1000);
  const offset = Number(url.searchParams.get('offset') || '0');
  const type = url.searchParams.get('type');
  const poolId = url.searchParams.get('poolId');
  const dateFrom = url.searchParams.get('dateFrom');
  const dateTo = url.searchParams.get('dateTo');
  let sql = 'SELECT * FROM transactions';
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (type) { conditions.push('type = ?'); params.push(type); }
  if (poolId) { conditions.push('(pool_id = ? OR from_pool_id = ? OR to_pool_id = ?)'); params.push(poolId, poolId, poolId); }
  if (dateFrom) { conditions.push('date >= ?'); params.push(dateFrom); }
  if (dateTo) { conditions.push('date <= ?'); params.push(dateTo); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY date DESC, id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>();
  const transactions = await rowToTransactions(db, rows.results ?? []);
  return json({ transactions });
}

async function handleOpenApiGetPools(db: D1): Promise<Response> {
  const rows = await db.prepare('SELECT id, name, balance, budget, color, is_card_pool FROM pools ORDER BY sort_order, id').all<{ id: string; name: string; balance: number; budget: number; color: string; is_card_pool: number }>();
  const pools = (rows.results ?? []).map(p => ({ id: p.id, name: p.name, balance: p.balance, budget: p.budget, color: p.color, isCardPool: p.is_card_pool }));
  return json({ pools });
}

async function handleOpenApiGetBets(db: D1): Promise<Response> {
  const rows = await db.prepare('SELECT * FROM bet_agreements ORDER BY sort_order ASC, is_starred DESC, created_at DESC').all();
  return json({ bets: rows.results ?? [] });
}

async function handleOpenApiGetCards(db: D1): Promise<Response> {
  const rows = await db.prepare('SELECT * FROM virtual_cards ORDER BY created_at DESC').all();
  return json({ cards: rows.results ?? [] });
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
  const pools = await db.prepare('SELECT id, name, balance, is_card_pool FROM pools').all<{ id: string; name: string; balance: number; is_card_pool: number }>();
  const poolStats = (pools.results ?? []).map(p => ({ id: p.id, name: p.name, balance: p.balance, spending: byPool[p.id] || 0, isCardPool: p.is_card_pool }));
  const activeCards = await db.prepare('SELECT COUNT(*) as c FROM virtual_cards WHERE status = ?').bind('saving').first<{ c: number }>();
  const printedCards = await db.prepare('SELECT COUNT(*) as c FROM virtual_cards WHERE status = ?').bind('printed').first<{ c: number }>();
  const activeBets = await db.prepare('SELECT COUNT(*) as c FROM bet_agreements WHERE status = ?').bind('active').first<{ c: number }>();
  return json({ month: thisMonth, income, expense, netIncome: income - expense, poolStats, cards: { active: activeCards?.c ?? 0, printed: printedCards?.c ?? 0 }, bets: { active: activeBets?.c ?? 0 } });
}

// 虚拟卡号生成 (1802前缀)
function generateCardNumber(denomination: number): string {
  const prefix = '1802';
  const mid = Math.floor(100000 + Math.random() * 900000).toString();
  const denomCode = (denomination / 1000).toString().padStart(4, '0');
  const check = Math.floor(10 + Math.random() * 90).toString();
  return `${prefix}${mid}${denomCode}${check}`;
}

function generateWritingCardNumber(): string {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const suffix = Math.floor(100000 + Math.random() * 900000).toString();
  return `WR${stamp}${suffix}`;
}

async function generateQrHash(): Promise<string> {
  const raw = `${crypto.randomUUID()}-${Date.now()}-${Math.random()}`;
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24).toUpperCase();
}

async function ensureWritingSchema(db: D1): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS writing_articles (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS writing_cards (
    id TEXT PRIMARY KEY NOT NULL,
    card_number TEXT UNIQUE NOT NULL,
    qr_hash TEXT UNIQUE NOT NULL,
    article_id TEXT NOT NULL,
    title TEXT NOT NULL,
    front_image TEXT,
    back_image TEXT,
    summary TEXT,
    issue_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    qr_locked INTEGER NOT NULL DEFAULT 0,
    printed INTEGER NOT NULL DEFAULT 0,
    printed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (article_id) REFERENCES writing_articles(id)
  )`).run();
  const info = await db.prepare('PRAGMA table_info(writing_cards)').all<{ name: string }>();
  const columns = new Set((info.results ?? []).map((row) => row.name));
  if (!columns.has('summary')) {
    await db.prepare('ALTER TABLE writing_cards ADD COLUMN summary TEXT').run();
  }
  if (!columns.has('qr_hash_version')) {
    await db.prepare('ALTER TABLE writing_cards ADD COLUMN qr_hash_version INTEGER NOT NULL DEFAULT 0').run();
  }
  const articleInfo = await db.prepare('PRAGMA table_info(writing_articles)').all<{ name: string }>();
  const articleColumns = new Set((articleInfo.results ?? []).map((row) => row.name));
  if (!articleColumns.has('encrypted_content')) {
    await db.prepare('ALTER TABLE writing_articles ADD COLUMN encrypted_content TEXT').run();
  }
  if (!articleColumns.has('content_iv')) {
    await db.prepare('ALTER TABLE writing_articles ADD COLUMN content_iv TEXT').run();
  }
  if (!articleColumns.has('encryption_version')) {
    await db.prepare('ALTER TABLE writing_articles ADD COLUMN encryption_version INTEGER NOT NULL DEFAULT 0').run();
  }
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_writing_cards_hash ON writing_cards(qr_hash)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_writing_cards_article ON writing_cards(article_id)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS writing_drafts (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT,
    content TEXT NOT NULL DEFAULT '',
    word_count INTEGER NOT NULL DEFAULT 0,
    front_image TEXT,
    back_image TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_writing_drafts_updated ON writing_drafts(updated_at)').run();
}

async function verifyAdminPassword(db: D1, password: string): Promise<boolean> {
  const admin = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind('admin').first<{ password_hash: string }>();
  if (!admin) return false;
  return await hashPassword(password) === admin.password_hash;
}

async function handleGetWritingCards(db: D1): Promise<Response> {
  await ensureWritingSchema(db);
  const rows = await db.prepare(
    `SELECT c.id, c.card_number, c.article_id, c.title, c.front_image, c.back_image, c.summary, c.issue_date,
            c.status, c.qr_locked, c.printed, c.printed_at, c.created_at, a.word_count
     FROM writing_cards c
     JOIN writing_articles a ON a.id = c.article_id
     ORDER BY c.created_at DESC`
  ).all<Record<string, unknown>>();
  return json({ cards: rows.results ?? [] });
}

async function handleGetWritingDrafts(db: D1): Promise<Response> {
  await ensureWritingSchema(db);
  const rows = await db.prepare(
    `SELECT id, title, summary, content, word_count, front_image, back_image, created_at, updated_at
     FROM writing_drafts
     ORDER BY updated_at DESC`
  ).all<Record<string, unknown>>();
  return json({ drafts: rows.results ?? [] });
}

async function handleSaveWritingDraft(db: D1, body: Record<string, unknown>): Promise<Response> {
  await ensureWritingSchema(db);
  const id = String(body.id ?? '').trim() || crypto.randomUUID();
  const title = String(body.title ?? '').trim();
  const summary = String(body.summary ?? '').trim();
  const content = String(body.content ?? '');
  const wordCount = Number(body.wordCount ?? 0);
  const frontImage = String(body.frontImage ?? '').trim();
  const backImage = String(body.backImage ?? '').trim();
  await db.prepare(
    `INSERT INTO writing_drafts (id, title, summary, content, word_count, front_image, back_image, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       summary = excluded.summary,
       content = excluded.content,
       word_count = excluded.word_count,
       front_image = excluded.front_image,
       back_image = excluded.back_image,
       updated_at = datetime('now')`
  ).bind(id, title, summary || null, content, wordCount, frontImage || null, backImage || null).run();
  return json({ ok: true, id });
}

async function handleDeleteWritingDraft(db: D1, id: string): Promise<Response> {
  await ensureWritingSchema(db);
  await db.prepare('DELETE FROM writing_drafts WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handlePostWritingCard(db: D1, body: Record<string, unknown>): Promise<Response> {
  await ensureWritingSchema(db);
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const encryptedContent = String(body.encryptedContent ?? '').trim();
  const contentIv = String(body.contentIv ?? '').trim();
  const encryptionVersion = Number(body.encryptionVersion ?? 0);
  const qrHashVerifier = String(body.qrHashVerifier ?? '').trim();
  const wordCount = Number(body.wordCount ?? 0);
  const frontImage = String(body.frontImage ?? '').trim();
  const backImage = String(body.backImage ?? '').trim();
  const summary = String(body.summary ?? '').trim();
  if (!title) return json({ error: 'title required' }, 400);
  const isEncrypted = encryptionVersion === 1;
  if (isEncrypted) {
    if (!encryptedContent || !contentIv || !qrHashVerifier) return json({ error: 'encrypted payload required' }, 400);
  } else if (!content) {
    return json({ error: 'content required' }, 400);
  }
  if (wordCount < 2000) return json({ error: 'Need at least 2000 counted words before opening a card' }, 400);

  const articleId = crypto.randomUUID();
  const cardId = crypto.randomUUID();
  const cardNumber = generateWritingCardNumber();
  const qrHash = isEncrypted ? qrHashVerifier : await generateQrHash();
  const issueDate = new Date().toISOString().split('T')[0];

  await db.batch([
    db.prepare('INSERT INTO writing_articles (id, title, content, word_count, encrypted_content, content_iv, encryption_version) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(articleId, title, isEncrypted ? '' : content, wordCount, isEncrypted ? encryptedContent : null, isEncrypted ? contentIv : null, isEncrypted ? 1 : 0),
    db.prepare('INSERT INTO writing_cards (id, card_number, qr_hash, article_id, title, front_image, back_image, summary, issue_date, qr_hash_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(cardId, cardNumber, qrHash, articleId, title, frontImage || null, backImage || null, summary || null, issueDate, isEncrypted ? 1 : 0),
  ]);

  return json({ ok: true, id: cardId, articleId, cardNumber, qrHash: isEncrypted ? null : qrHash, issueDate });
}

async function handleFinishWritingCard(db: D1, id: string): Promise<Response> {
  await ensureWritingSchema(db);
  await db.prepare('UPDATE writing_cards SET qr_locked = 1, printed = 1, printed_at = datetime("now"), status = ? WHERE id = ?')
    .bind('printed', id)
    .run();
  return json({ ok: true });
}

async function handleRevealWritingCardHash(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  await ensureWritingSchema(db);
  const password = String(body.password ?? '');
  if (!(await verifyAdminPassword(db, password))) return json({ error: 'Invalid admin password' }, 403);
  const row = await db.prepare('SELECT qr_hash, qr_hash_version FROM writing_cards WHERE id = ?').bind(id).first<{ qr_hash: string; qr_hash_version: number }>();
  if (!row) return json({ error: 'not found' }, 404);
  if ((row.qr_hash_version ?? 0) >= 1) {
    return json({ error: '加密卡不会在系统里保存 QR 原串/密钥，只能从已导出的图片或实体卡上读取。' }, 410);
  }
  return json({ qrHash: row.qr_hash });
}

async function handleDeleteWritingCard(db: D1, id: string, body: Record<string, unknown>): Promise<Response> {
  await ensureWritingSchema(db);
  const password = String(body.password ?? '');
  if (!(await verifyAdminPassword(db, password))) return json({ error: 'Invalid admin password' }, 403);
  const row = await db.prepare('SELECT article_id FROM writing_cards WHERE id = ?').bind(id).first<{ article_id: string }>();
  if (!row) return json({ error: 'not found' }, 404);
  await db.batch([
    db.prepare('DELETE FROM writing_cards WHERE id = ?').bind(id),
    db.prepare('DELETE FROM writing_articles WHERE id = ?').bind(row.article_id),
  ]);
  return json({ ok: true });
}

async function handleReadWritingCard(db: D1, body: Record<string, unknown>): Promise<Response> {
  await ensureWritingSchema(db);
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!code) return json({ error: 'Please enter a card reading code' }, 400);
  const codeVerifier = await hashPassword(code);
  const row = await db.prepare(
    `SELECT c.id, c.card_number, c.title, c.front_image, c.back_image, c.summary, c.issue_date, c.created_at,
            a.id AS article_id, a.content, a.encrypted_content, a.content_iv, a.encryption_version,
            a.word_count, a.created_at AS article_created_at
     FROM writing_cards c
     JOIN writing_articles a ON a.id = c.article_id
     WHERE c.qr_hash = ? OR c.qr_hash = ? OR (c.card_number = ? AND COALESCE(a.encryption_version, 0) = 0)`
  ).bind(codeVerifier, code, code).first<Record<string, unknown>>();
  if (!row) return json({ error: 'Card not found' }, 404);
  return json({ card: row });
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

// ===== B2 Cloud Storage (Backblaze) =====

interface B2Auth {
  authorizationToken: string;
  apiUrl: string;
  downloadUrl: string;
  accountId: string;
  allowed: { bucketId: string | null };
}

async function b2Authorize(env: Env): Promise<B2Auth> {
  const keyId = env.B2_KEY_ID;
  const appKey = env.B2_APP_KEY;
  if (!keyId || !appKey) throw new Error('B2 credentials not configured');
  
  const auth = btoa(`${keyId}:${appKey}`);
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`B2 auth failed: ${err}`);
  }
  return res.json() as Promise<B2Auth>;
}

async function b2UploadFile(env: Env, fileName: string, contentType: string, body: ArrayBuffer): Promise<string> {
  const auth = await b2Authorize(env);
  const bucketId = auth.allowed.bucketId || await b2GetBucketId(auth, env);
  
  const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketId }),
  });
  if (!uploadUrlRes.ok) {
    const detail = await uploadUrlRes.text();
    throw new Error(`Failed to get upload URL for bucket ${bucketId}: ${detail || uploadUrlRes.statusText}`);
  }
  const { uploadUrl, authorizationToken } = await uploadUrlRes.json() as { uploadUrl: string; authorizationToken: string };
  
  const sha1 = await crypto.subtle.digest('SHA-1', body);
  const sha1Hex = Array.from(new Uint8Array(sha1)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileName),
      'Content-Type': contentType,
      'X-Bz-Content-Sha1': sha1Hex,
      'Content-Length': String(body.byteLength),
    },
    body,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`B2 upload failed: ${err}`);
  }
  
  // Return file path for later proxy access
  const bucketName = env.B2_BUCKET || 'jizhang';
  return `${bucketName}/${encodeURIComponent(fileName)}`;
}

async function b2GetBucketId(auth: B2Auth, env: Env): Promise<string> {
  const bucketName = env.B2_BUCKET || 'jizhang';
  const res = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_buckets`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId: auth.accountId, bucketName }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Failed to list B2 buckets: ${detail || res.statusText}`);
  }
  const data = await res.json() as { buckets: Array<{ bucketId: string; bucketName: string }> };
  const bucket = data.buckets.find(b => b.bucketName === bucketName);
  if (!bucket) throw new Error(`Bucket '${bucketName}' not found`);
  return bucket.bucketId;
}

async function b2DownloadFile(env: Env, filePath: string): Promise<Response> {
  const auth = await b2Authorize(env);
  const bucketName = env.B2_BUCKET || 'jizhang';
  const fileKey = decodeURIComponent(filePath.replace(`${bucketName}/`, ''));
  
  const res = await fetch(`${auth.downloadUrl}/file/${bucketName}/${fileKey}`, {
    headers: { 'Authorization': auth.authorizationToken },
  });
  
  if (!res.ok) {
    return new Response('Image not found', { status: 404 });
  }
  
  const contentType = res.headers.get('content-type') || 'image/png';
  const buffer = await res.arrayBuffer();
  
  return new Response(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
      ...CORS_HEADERS,
    },
  });
}

// ===== 图片上传 (B2) =====
async function handleUploadImage(request: Request, env: Env): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  
  if (!file) return json({ error: 'No file provided' }, 400);

  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) return json({ error: 'Invalid file type' }, 400);
  if (file.size > 25 * 1024 * 1024) return json({ error: 'File too large (max 25MB)' }, 400);

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_').replace(/__/g, '_');
  const fileName = `cards/${timestamp}_${safeName}`;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const filePath = await b2UploadFile(env, fileName, file.type, arrayBuffer);
    const proxyUrl = `/api/b2-image/${filePath}`;
    return json({ ok: true, url: proxyUrl, fileName });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
}

// ===== B2 图片代理 =====
async function handleB2ImageProxy(env: Env, filePath: string): Promise<Response> {
  try {
    return await b2DownloadFile(env, filePath);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
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

    // Writing memorial card API
    if (pathname === '/api/writing/cards' && request.method === 'GET') {
      return handleGetWritingCards(db);
    }

    if (pathname === '/api/writing/drafts' && request.method === 'GET') {
      return handleGetWritingDrafts(db);
    }

    if (pathname === '/api/writing/drafts' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleSaveWritingDraft(db, body);
    }

    if (segments[0] === 'writing' && segments[1] === 'drafts' && segments[2] && request.method === 'DELETE') {
      return handleDeleteWritingDraft(db, segments[2]);
    }

    if (pathname === '/api/writing/cards' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handlePostWritingCard(db, body);
    }

    if (pathname === '/api/writing/read' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleReadWritingCard(db, body);
    }

    if (segments[0] === 'writing' && segments[1] === 'cards' && segments[2] && segments[3] === 'finish' && request.method === 'POST') {
      return handleFinishWritingCard(db, segments[2]);
    }

    if (segments[0] === 'writing' && segments[1] === 'cards' && segments[2] && segments[3] === 'reveal' && request.method === 'POST') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleRevealWritingCardHash(db, segments[2], body);
    }

    if (segments[0] === 'writing' && segments[1] === 'cards' && segments[2] && request.method === 'DELETE') {
      const body = (await request.json()) as Record<string, unknown>;
      return handleDeleteWritingCard(db, segments[2], body);
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

    // B2 图片代理
    if (segments[0] === 'b2-image' && segments.length > 1 && request.method === 'GET') {
      const filePath = segments.slice(1).join('/');
      return handleB2ImageProxy(env, filePath);
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
      if (v1Path === 'pools' && request.method === 'GET') return handleOpenApiGetPools(db);
      if (v1Path === 'bets' && request.method === 'GET') return handleOpenApiGetBets(db);
      if (v1Path === 'cards' && request.method === 'GET') return handleOpenApiGetCards(db);
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
