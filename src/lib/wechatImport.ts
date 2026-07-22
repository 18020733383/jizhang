import * as XLSX from 'xlsx';

/** 从微信账单解析出的一条记录 */
export interface ParsedBillRow {
  /** 稳定行 id（仅前端用） */
  key: string;
  /** YYYY-MM-DD */
  date: string;
  /** 原始交易时间（含时分秒，若有） */
  datetime: string;
  /** 正数金额 */
  amount: number;
  type: 'income' | 'expense';
  /** 交易对方 */
  counterparty: string;
  /** 商品 */
  product: string;
  /** 微信备注 */
  wechatNote: string;
  /** 当前状态 */
  status: string;
  /** 数量（若账单有该列） */
  quantity?: number;
  /** 建议填入记账 note 的默认文案 */
  suggestedNote: string;
}

export interface ImportMatchResult {
  /** 已在库中、将跳过 */
  matched: ParsedBillRow[];
  /** 库中没有、可导入 */
  unmatched: ParsedBillRow[];
  /** 解析总数 */
  total: number;
  /** 因状态过滤掉的行数 */
  skippedByStatus: number;
}

const HEADER_ALIASES: Record<string, string[]> = {
  datetime: ['交易时间', '交易日期', '时间'],
  type: ['收/支', '收支', '类型'],
  amount: ['金额(元)', '金额（元）', '金额', '交易金额'],
  counterparty: ['交易对方', '对方', '商户名称'],
  product: ['商品', '商品说明', '商品名称'],
  status: ['当前状态', '交易状态', '状态'],
  note: ['备注', '备注说明'],
  quantity: ['数量', '件数'],
};

const SKIP_STATUS_KEYWORDS = [
  '退款',
  '失败',
  '关闭',
  '已撤销',
  '已取消',
];

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const i = headers.findIndex((h) => h === alias || h.includes(alias));
    if (i >= 0) return i;
  }
  return -1;
}

function parseAmount(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.abs(raw);
  let s = String(raw).trim();
  s = s.replace(/[¥￥,\s]/g, '').replace(/元/g, '');
  // 支出有时写作 -12.5
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n);
}

function parseDateTime(raw: unknown): { date: string; datetime: string } | null {
  if (raw == null || raw === '') return null;

  // Excel 序列日期
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    const y = parsed.y;
    const m = String(parsed.m).padStart(2, '0');
    const d = String(parsed.d).padStart(2, '0');
    const H = String(parsed.H ?? 0).padStart(2, '0');
    const M = String(parsed.M ?? 0).padStart(2, '0');
    const S = String(parsed.S ?? 0).padStart(2, '0');
    return {
      date: `${y}-${m}-${d}`,
      datetime: `${y}-${m}-${d} ${H}:${M}:${S}`,
    };
  }

  const s = String(raw).trim();
  // 2024-01-15 12:30:00 / 2024/1/15 12:30 / 2024.01.15
  const m = s.match(
    /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  );
  if (!m) return null;
  const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const time =
    m[4] != null
      ? ` ${m[4].padStart(2, '0')}:${m[5].padStart(2, '0')}:${(m[6] ?? '0').padStart(2, '0')}`
      : '';
  return { date, datetime: `${date}${time}`.trim() };
}

function parseType(raw: unknown, amountRaw: unknown): 'income' | 'expense' | null {
  const s = String(raw ?? '').trim();
  if (s.includes('收入') || s === '收' || /income/i.test(s)) return 'income';
  if (s.includes('支出') || s === '支' || /expense/i.test(s)) return 'expense';
  // 无「收/支」列时，看金额正负
  if (typeof amountRaw === 'number') {
    if (amountRaw < 0) return 'expense';
    if (amountRaw > 0) return 'income';
  }
  const amountStr = String(amountRaw ?? '');
  if (amountStr.startsWith('-')) return 'expense';
  if (amountStr.startsWith('+')) return 'income';
  // 微信账单默认多为支出
  if (!s) return 'expense';
  return null;
}

function shouldSkipStatus(status: string): boolean {
  if (!status) return false;
  return SKIP_STATUS_KEYWORDS.some((k) => status.includes(k));
}

function buildSuggestedNote(counterparty: string, product: string, wechatNote: string): string {
  const parts = [counterparty, product, wechatNote]
    .map((p) => p.trim())
    .filter((p) => p && p !== '/' && p !== '-');
  // 去重并拼接
  const unique: string[] = [];
  for (const p of parts) {
    if (!unique.includes(p)) unique.push(p);
  }
  return unique.slice(0, 2).join(' · ') || '';
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader);
    const joined = cells.join('|');
    if (
      (joined.includes('交易时间') || joined.includes('交易日期')) &&
      (joined.includes('金额') || joined.includes('收/支') || joined.includes('收支'))
    ) {
      return i;
    }
  }
  // 兜底：第一行看起来像表头
  if (rows.length > 0) {
    const first = (rows[0] ?? []).map(normalizeHeader).join('|');
    if (first.includes('日期') || first.includes('时间') || first.includes('金额')) {
      return 0;
    }
  }
  return -1;
}

/**
 * 解析微信账单 Excel / CSV（ArrayBuffer）。
 * 兼容账单明细常见表头；表头前说明行会自动跳过。
 */
export function parseWechatBillBuffer(buffer: ArrayBuffer): {
  rows: ParsedBillRow[];
  skippedByStatus: number;
} {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], skippedByStatus: 0 };
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const headerIdx = findHeaderRow(matrix);
  if (headerIdx < 0) {
    throw new Error('无法识别账单表头。请确认是微信导出的账单 Excel/CSV（含「交易时间」「金额」列）。');
  }

  const headers = (matrix[headerIdx] ?? []).map(normalizeHeader);
  const col = {
    datetime: findColumnIndex(headers, HEADER_ALIASES.datetime),
    type: findColumnIndex(headers, HEADER_ALIASES.type),
    amount: findColumnIndex(headers, HEADER_ALIASES.amount),
    counterparty: findColumnIndex(headers, HEADER_ALIASES.counterparty),
    product: findColumnIndex(headers, HEADER_ALIASES.product),
    status: findColumnIndex(headers, HEADER_ALIASES.status),
    note: findColumnIndex(headers, HEADER_ALIASES.note),
    quantity: findColumnIndex(headers, HEADER_ALIASES.quantity),
  };

  if (col.datetime < 0 || col.amount < 0) {
    throw new Error('账单缺少必要列：需要「交易时间」和「金额」。');
  }

  const rows: ParsedBillRow[] = [];
  let skippedByStatus = 0;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (!line.some((c) => String(c ?? '').trim() !== '')) continue;

    const dt = parseDateTime(line[col.datetime]);
    if (!dt) continue;

    const amountRaw = line[col.amount];
    const amount = parseAmount(amountRaw);
    if (amount == null) continue;

    const typeRaw = col.type >= 0 ? line[col.type] : '';
    // 「/」或空：微信转账中性类型，按支出处理（用户可跳过）
    let type = parseType(typeRaw, amountRaw);
    if (!type) {
      const t = String(typeRaw).trim();
      if (t === '/' || t === '' || t === '不计收支') {
        // 如零钱通转入等，默认跳过不计收支
        skippedByStatus += 1;
        continue;
      }
      type = 'expense';
    }

    const status = col.status >= 0 ? String(line[col.status] ?? '').trim() : '';
    if (shouldSkipStatus(status)) {
      skippedByStatus += 1;
      continue;
    }

    const counterparty = col.counterparty >= 0 ? String(line[col.counterparty] ?? '').trim() : '';
    const product = col.product >= 0 ? String(line[col.product] ?? '').trim() : '';
    const wechatNote = col.note >= 0 ? String(line[col.note] ?? '').trim() : '';
    let quantity: number | undefined;
    if (col.quantity >= 0) {
      const q = parseFloat(String(line[col.quantity] ?? ''));
      if (Number.isFinite(q) && q > 0) quantity = q;
    }

    const suggestedNote = buildSuggestedNote(counterparty, product, wechatNote);
    const key = `${dt.datetime}|${type}|${amount.toFixed(2)}|${counterparty}|${r}`;

    rows.push({
      key,
      date: dt.date,
      datetime: dt.datetime,
      amount,
      type,
      counterparty,
      product,
      wechatNote,
      status,
      quantity,
      suggestedNote,
    });
  }

  return { rows, skippedByStatus };
}

/** 与库中交易比对用的键：日期 + 金额 + 类型（可选数量） */
export function matchKey(
  date: string,
  amount: number,
  type: 'income' | 'expense' | 'transfer' | 'intercept',
  quantity?: number
): string {
  const d = date.includes('T') ? date.split('T')[0] : date.slice(0, 10);
  const q = quantity != null && quantity > 0 ? `|q${quantity}` : '';
  return `${d}|${Number(amount).toFixed(2)}|${type}${q}`;
}

export interface ExistingTxForMatch {
  date: string;
  amount: number;
  type: string;
}

/**
 * 按 日期 + 金额 + 类型 多重集匹配：
 * 同一天同金额有多条时，只消耗对应数量的已有记录。
 */
export function matchBillAgainstExisting(
  billRows: ParsedBillRow[],
  existing: ExistingTxForMatch[],
  skippedByStatus = 0
): ImportMatchResult {
  const pool = new Map<string, number>();
  for (const tx of existing) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const k = matchKey(tx.date, tx.amount, tx.type as 'income' | 'expense');
    pool.set(k, (pool.get(k) ?? 0) + 1);
  }

  const matched: ParsedBillRow[] = [];
  const unmatched: ParsedBillRow[] = [];

  for (const row of billRows) {
    // 账单侧若有数量，先尝试带数量匹配，再回退无数量
    const keys = [
      row.quantity != null ? matchKey(row.date, row.amount, row.type, row.quantity) : null,
      matchKey(row.date, row.amount, row.type),
    ].filter(Boolean) as string[];

    let found = false;
    for (const k of keys) {
      const left = pool.get(k) ?? 0;
      if (left > 0) {
        pool.set(k, left - 1);
        matched.push(row);
        found = true;
        break;
      }
    }
    if (!found) unmatched.push(row);
  }

  return {
    matched,
    unmatched,
    total: billRows.length,
    skippedByStatus,
  };
}
